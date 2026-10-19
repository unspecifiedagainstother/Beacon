// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Beacon runtime — single entry point for the addon platform.
 *
 * Called exactly once from initializeRedux(), right after the real store
 * exists. Wires the hook bus into the middleware, loads addons, registers
 * builtin commands, and exposes window.Beacon for console work.
 */

import type { Store } from 'redux';
import type { StateType } from '../../state/reducer.preload.ts';
import { NavTab, SettingsPage } from '../../types/Nav.std.ts';
import { HookBus } from './hook-bus.std.ts';
import { attachHookBus } from './middleware.preload.ts';
import { addonLoader, type AddonLoader } from './loader.preload.ts';
import { commandRegistry, type CommandRegistry } from './commands.dom.ts';
import { addonSettings, type AddonSettingsStore } from './settings.std.ts';
import { addBeaconFilter, applyBeaconFilter } from './filters.std.ts';
import { createPatcher } from './patcher.std.ts';
import { createElement, createModal } from './ui.dom.ts';
import { createLogger } from '../../logging/log.std.ts';
import { BEACON_FEATURES } from '../features.std.ts';

const log = createLogger('beacon/runtime');

export type BeaconGlobal = {
  hooks: HookBus;
  loader: AddonLoader;
  commands: CommandRegistry;
  settings: AddonSettingsStore;
  filters: {
    add: typeof addBeaconFilter;
    apply: typeof applyBeaconFilter;
  };
  createPatcher: typeof createPatcher;
  store: Store<StateType>;
  /** Jump to Settings → Beacon → Modules. */
  openModules: () => void;
};

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Window {
    Beacon: BeaconGlobal;
  }
}

export const hookBus = new HookBus();

let initialized = false;

function openModules(): void {
  window.reduxActions?.nav.changeLocation({
    tab: NavTab.Settings,
    details: { page: SettingsPage.BeaconModules },
  });
}

export function initializeBeaconRuntime(store: Store<StateType>): void {
  if (initialized) {
    log.warn('initializeBeaconRuntime called twice, ignoring');
    return;
  }
  initialized = true;

  try {
    purgeLegacyPlaintext();
    syncBlurPII(store);
    attachHookBus(hookBus);
    registerBuiltinCommands();

    window.Beacon = {
      hooks: hookBus,
      loader: addonLoader,
      commands: commandRegistry,
      settings: addonSettings,
      filters: { add: addBeaconFilter, apply: applyBeaconFilter },
      /** Fresh patcher for console experiments; addons get their own. */
      createPatcher,
      store,
      openModules,
    };
  } catch (error) {
    log.error('initializeBeaconRuntime error:', error);
    return;
  }

  void (async () => {
    try {
      await addonLoader.initialize(store, hookBus);
      hookBus.emit('onAppStart');
    } catch (error) {
      log.error('addon loader initialization error:', error);
    }
  })();
}

/**
 * Blur PII applies app-wide (Settings, contact details, modals), so the class
 * goes on <body> rather than on any one component, and follows the setting
 * live. Elements opt in with the `Beacon-pii` class.
 */
function syncBlurPII(store: Store<StateType>): void {
  const fallback =
    BEACON_FEATURES.find(f => f.key === 'beaconBlurPII')?.defaultValue ?? true;
  let current: boolean | undefined;
  const apply = () => {
    const next = store.getState().items.beaconBlurPII ?? fallback;
    if (next !== current) {
      current = next;
      document.body.classList.toggle('Beacon--blur-pii', next);
    }
  };
  apply();
  store.subscribe(apply);
}

/**
 * Message logger v2 kept message bodies in localStorage, which is not
 * encrypted at rest. v3 stores retained content in the SQLCipher DB instead;
 * delete what v2 left behind whether or not the addon is ever enabled again.
 */
function purgeLegacyPlaintext(): void {
  for (const key of [
    'beacon-addon-message-logger-log',
    'beacon-addon-message-logger-deleted-ids',
  ]) {
    try {
      if (localStorage.getItem(key) != null) {
        localStorage.removeItem(key);
        log.info(`removed legacy plaintext store ${key}`);
      }
    } catch {
      // Storage unavailable — nothing to purge.
    }
  }
}

function renderCommandList(): HTMLElement {
  const rows = commandRegistry.list().map(cmd =>
    createElement({
      tag: 'div',
      className: 'BeaconList__row',
      children: [
        createElement({
          tag: 'code',
          className: 'BeaconList__code',
          text: `/${cmd.id}${cmd.usage ? ` ${cmd.usage}` : ''}`,
        }),
        createElement({
          tag: 'span',
          className: 'BeaconList__meta',
          text: cmd.description ?? cmd.name,
        }),
        ...(cmd.addonId
          ? [
              createElement({
                tag: 'span',
                className: 'BeaconChip',
                text: cmd.addonId,
              }),
            ]
          : []),
      ],
    })
  );
  return createElement({ tag: 'div', className: 'BeaconList', children: rows });
}

function registerBuiltinCommands(): void {
  commandRegistry.register({
    id: 'help',
    name: 'Help',
    description: 'List every available command',
    execute: () => {
      createModal({
        title: 'Beacon commands',
        content: renderCommandList(),
        size: 'wide',
      });
    },
  });

  commandRegistry.register({
    id: 'addons',
    name: 'Addons',
    description: 'Open Settings → Beacon → Modules',
    execute: () => openModules(),
  });

  const findAddon = (query: string | undefined) => {
    if (!query) {
      return undefined;
    }
    const q = query.toLowerCase();
    const all = addonLoader.list();
    return (
      all.find(a => a.id === q) ??
      all.find(a => a.name.toLowerCase() === q) ??
      all.find(a => a.id.startsWith(q))
    );
  };

  commandRegistry.register({
    id: 'enable',
    name: 'Enable addon',
    usage: '<addon-id>',
    description: 'Enable an addon (takes effect immediately)',
    execute: async ctx => {
      const addon = findAddon(ctx.args[0]);
      if (!addon) {
        ctx.reply(
          `Unknown addon. Try: ${addonLoader
            .list()
            .map(a => a.id)
            .join(', ')}`,
          'warning'
        );
        return;
      }
      const ok = await addonLoader.enable(addon.id);
      ctx.reply(
        ok ? `${addon.name} enabled` : `${addon.name} failed to start`,
        ok ? 'success' : 'error'
      );
    },
  });

  commandRegistry.register({
    id: 'disable',
    name: 'Disable addon',
    usage: '<addon-id>',
    description: 'Disable an addon (takes effect immediately)',
    execute: async ctx => {
      const addon = findAddon(ctx.args[0]);
      if (!addon) {
        ctx.reply('Unknown addon', 'warning');
        return;
      }
      await addonLoader.disable(addon.id);
      ctx.reply(`${addon.name} disabled`, 'success');
    },
  });

  commandRegistry.register({
    id: 'reload',
    name: 'Restart addon',
    usage: '<addon-id>',
    description: 'Stop and start an addon again',
    execute: async ctx => {
      const addon = findAddon(ctx.args[0]);
      if (!addon?.enabled) {
        ctx.reply('Addon not running', 'warning');
        return;
      }
      const ok = await addonLoader.restart(addon.id);
      ctx.reply(
        ok ? `${addon.name} restarted` : 'Restart failed',
        ok ? 'success' : 'error'
      );
    },
  });

  commandRegistry.register({
    id: 'shrug',
    name: 'Shrug',
    usage: '[text]',
    description: 'Append ¯\\_(ツ)_/¯ to your message',
    execute: ctx => {
      ctx.insertText(`${ctx.argsRaw ? `${ctx.argsRaw} ` : ''}¯\\_(ツ)_/¯`);
    },
  });
}
