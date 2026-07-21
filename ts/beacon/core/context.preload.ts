// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Builds the AddonContext each addon receives in start().
 *
 * Every registration made through the context lands in one disposable bag, so
 * disabling an addon tears down everything it touched — hooks, patches, DOM
 * listeners, styles, keybinds, commands — without an app reload.
 */

import type { Store } from 'redux';
import type { StateType } from '../../state/reducer.preload.ts';
import type { AddonContext, AddonManifest, Disposer } from './types.dom.ts';
import type { HookBus } from './hook-bus.std.ts';
import { createPatcher } from './patcher.std.ts';
import {
  registerActionInterceptor,
  registerMessageInterceptor,
  registerNotificationInterceptor,
} from './middleware.preload.ts';
import { commandRegistry } from './commands.dom.ts';
import { createElement, createModal, showNotification } from './ui.dom.ts';
import { createLogger } from '../../logging/log.std.ts';

const logger = createLogger('beacon/context');

const IS_MAC = /mac/i.test(navigator.platform);

function matchesCombo(combo: string, ev: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop();
  if (!key) {
    return false;
  }

  const wantCtrl = parts.includes('ctrl') || (!IS_MAC && parts.includes('mod'));
  const wantMeta = parts.includes('meta') || (IS_MAC && parts.includes('mod'));
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt');

  return (
    ev.key.toLowerCase() === key &&
    ev.ctrlKey === wantCtrl &&
    ev.metaKey === wantMeta &&
    ev.shiftKey === wantShift &&
    ev.altKey === wantAlt
  );
}

export type DisposableContext = {
  ctx: AddonContext;
  dispose: () => void;
};

export function createAddonContext(
  manifest: AddonManifest,
  store: Store<StateType>,
  bus: HookBus
): DisposableContext {
  const { id } = manifest;
  const disposers: Array<Disposer> = [];
  const patcher = createPatcher();

  function track(disposer: Disposer): Disposer {
    disposers.push(disposer);
    return disposer;
  }

  const storagePrefix = `beacon-addon-${id}-`;

  const ctx: AddonContext = {
    id,

    // Addon-facing logging goes to the DevTools console on purpose — that is
    // where addon authors live. oxlint-disable no-console for these three.
    // oxlint-disable-next-line no-console
    log: (...args) => console.log(`[Beacon:${id}]`, ...args),
    // oxlint-disable-next-line no-console
    warn: (...args) => console.warn(`[Beacon:${id}]`, ...args),
    // oxlint-disable-next-line no-console
    error: (...args) => console.error(`[Beacon:${id}]`, ...args),

    hooks: {
      on: (name, fn) => track(bus.on(name, fn)),
    },

    patcher,

    redux: {
      getState: () => store.getState(),
      dispatch: action => store.dispatch(action),
      subscribe: listener => track(store.subscribe(listener)),
      observe: (selector, cb) => {
        let prev = selector(store.getState());
        return track(
          store.subscribe(() => {
            const value = selector(store.getState());
            if (value !== prev) {
              const last = prev;
              prev = value;
              try {
                cb(value, last);
              } catch (error) {
                logger.error(`${id}: observe callback error:`, error);
              }
            }
          })
        );
      },
    },

    actions: {
      intercept: (type, interceptor) =>
        track(registerActionInterceptor(type, interceptor)),
    },

    messages: {
      intercept: (interceptor) => track(registerMessageInterceptor(interceptor)),
    },

    notifications: {
      intercept: (interceptor) =>
        track(registerNotificationInterceptor(interceptor)),
    },

    signal: {
      get conversationController() {
        return window.ConversationController;
      },
      get messageCache() {
        return window.MessageCache;
      },
      get reduxActions() {
        return window.reduxActions;
      },
      i18n: key => {
        try {
          return (
            (window.SignalContext?.i18n as unknown as (k: string) => string)?.(
              key
            ) ?? key
          );
        } catch {
          return key;
        }
      },
    },

    dom: {
      query: selector => document.querySelector(selector),
      queryAll: selector => Array.from(document.querySelectorAll(selector)),
      on: (target, type, fn, options) => {
        target.addEventListener(type, fn, options);
        return track(() => target.removeEventListener(type, fn, options));
      },
    },

    css: {
      inject: cssText => {
        const style = document.createElement('style');
        style.dataset.beaconAddon = id;
        style.textContent = cssText;
        document.head.appendChild(style);
        return track(() => style.remove());
      },
    },

    keybinds: {
      register: (combo, fn) => {
        const handler = (ev: Event) => {
          const keyEv = ev as KeyboardEvent;
          if (matchesCombo(combo, keyEv)) {
            keyEv.preventDefault();
            try {
              fn(keyEv);
            } catch (error) {
              logger.error(`${id}: keybind ${combo} error:`, error);
            }
          }
        };
        document.addEventListener('keydown', handler);
        return track(() => document.removeEventListener('keydown', handler));
      },
    },

    ui: {
      createModal,
      createElement,
      showNotification,
    },

    commands: {
      register: command => track(commandRegistry.register(command)),
      list: () => commandRegistry.list(),
      execute: (commandId, argsRaw) =>
        commandRegistry.execute(commandId, argsRaw),
    },

    storage: {
      get: <T,>(key: string): T | undefined => {
        try {
          const raw = localStorage.getItem(storagePrefix + key);
          return raw == null ? undefined : (JSON.parse(raw) as T);
        } catch {
          return undefined;
        }
      },
      set: (key, value) => {
        try {
          localStorage.setItem(storagePrefix + key, JSON.stringify(value));
        } catch (error) {
          logger.error(`${id}: storage.set(${key}) failed:`, error);
        }
      },
      delete: key => {
        localStorage.removeItem(storagePrefix + key);
      },
      keys: () => {
        const result: Array<string> = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key?.startsWith(storagePrefix)) {
            result.push(key.slice(storagePrefix.length));
          }
        }
        return result;
      },
    },

    settings: {
      register: (defs) => {
        // TODO: wire into Preferences UI to render addon settings
        // For now, track them in localStorage under 'beacon-addon-settings-{id}'
        const settingsPrefix = `beacon-addon-settings-${id}-`;
        return track(() => {
          // cleanup on dispose: delete all addon settings
          defs.forEach((def) => {
            localStorage.removeItem(settingsPrefix + def.key);
          });
        });
      },
      get: <T,>(key: string): T | undefined => {
        try {
          const raw = localStorage.getItem(
            `beacon-addon-settings-${id}-${key}`
          );
          return raw == null ? undefined : (JSON.parse(raw) as T);
        } catch {
          return undefined;
        }
      },
      set: (key, value) => {
        try {
          localStorage.setItem(
            `beacon-addon-settings-${id}-${key}`,
            JSON.stringify(value)
          );
        } catch (error) {
          logger.error(`${id}: settings.set(${key}) failed:`, error);
        }
      },
    },

    net: {
      fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    },

    onDispose: fn => {
      track(fn);
    },
  };

  const dispose = () => {
    patcher.unpatchAll();
    // LIFO, mirroring registration order semantics.
    for (const disposer of disposers.splice(0).reverse()) {
      try {
        disposer();
      } catch (error) {
        logger.error(`${id}: dispose error:`, error);
      }
    }
  };

  return { ctx, dispose };
}
