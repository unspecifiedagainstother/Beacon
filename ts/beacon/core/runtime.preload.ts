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
import { HookBus } from './hook-bus.std.ts';
import { attachHookBus } from './middleware.preload.ts';
import { addonLoader, type AddonLoader } from './loader.preload.ts';
import { commandRegistry, type CommandRegistry } from './commands.dom.ts';
import { createPatcher } from './patcher.std.ts';

export type BeaconGlobal = {
  hooks: HookBus;
  loader: AddonLoader;
  commands: CommandRegistry;
  createPatcher: typeof createPatcher;
  store: Store<StateType>;
};

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Window {
    Beacon: BeaconGlobal;
  }
}

export const hookBus = new HookBus();

let initialized = false;

export function initializeBeaconRuntime(store: Store<StateType>): void {
  if (initialized) {
    return;
  }
  initialized = true;

  attachHookBus(hookBus);
  registerBuiltinCommands();

  window.Beacon = {
    hooks: hookBus,
    loader: addonLoader,
    commands: commandRegistry,
    /** Fresh patcher for console experiments; addons get their own. */
    createPatcher,
    store,
  };

  void (async () => {
    await addonLoader.initialize(store, hookBus);
    hookBus.emit('onAppStart');
  })();
}

function registerBuiltinCommands(): void {
  commandRegistry.register({
    id: 'help',
    name: 'Help',
    description: 'List available commands',
    execute: ctx => {
      const lines = commandRegistry
        .list()
        .map(c => `/${c.id}${c.usage ? ` ${c.usage}` : ''} — ${c.description || c.name}`)
        .sort();
      ctx.insertText(`Available commands:\n${lines.join('\n')}`);
    },
  });

  commandRegistry.register({
    id: 'addons',
    name: 'List addons',
    description: 'Show all addons and their state',
    execute: ctx => {
      const lines = addonLoader
        .list()
        .map(a => `${a.enabled ? '●' : '○'} ${a.id} — ${a.description ?? a.name}`);
      ctx.insertText(
        lines.length ? `Addons:\n${lines.join('\n')}` : 'No addons registered.'
      );
    },
  });

  commandRegistry.register({
    id: 'enable',
    name: 'Enable addon',
    usage: '<addon-id>',
    description: 'Enable an addon (takes effect immediately)',
    execute: async ctx => {
      const [id] = ctx.args;
      if (!id) {
        ctx.reply('Usage: /enable <addon-id>');
        return;
      }
      const ok = await addonLoader.enable(id);
      ctx.reply(ok ? `Enabled ${id}` : `Could not enable ${id}`);
    },
  });

  commandRegistry.register({
    id: 'disable',
    name: 'Disable addon',
    usage: '<addon-id>',
    description: 'Disable an addon (takes effect immediately)',
    execute: async ctx => {
      const [id] = ctx.args;
      if (!id) {
        ctx.reply('Usage: /disable <addon-id>');
        return;
      }
      const ok = await addonLoader.disable(id);
      ctx.reply(ok ? `Disabled ${id}` : `Could not disable ${id}`);
    },
  });
}
