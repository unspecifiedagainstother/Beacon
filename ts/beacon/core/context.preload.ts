// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { Store } from 'redux';
import type { StateType } from '../../state/reducer.preload.ts';
import type { AddonContext, AddonManifest, Disposer } from './types.dom.ts';
import type { HookBus } from './hook-bus.std.ts';
import { createPatcher } from './patcher.std.ts';
import { addBeaconAsyncFilter, addBeaconFilter } from './filters.std.ts';
import { registerActionInterceptor } from './middleware.preload.ts';
import { commandRegistry } from './commands.dom.ts';
import { addonSettings } from './settings.std.ts';
import { registerSlot } from './slots.std.ts';
import { createElement, createModal, showNotification } from './ui.dom.ts';
import { createLogger } from '../../logging/log.std.ts';

const logger = createLogger('beacon/context');

const IS_MAC = /mac/i.test(navigator.platform);

function keyFromCode(code: string): string {
  if (code.startsWith('Key')) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  return code.toLowerCase();
}

export function matchesCombo(combo: string, ev: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop();
  if (!key) {
    return false;
  }

  const wantCtrl = parts.includes('ctrl') || (!IS_MAC && parts.includes('mod'));
  const wantMeta = parts.includes('meta') || (IS_MAC && parts.includes('mod'));
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt');

  const keyMatches =
    ev.key.toLowerCase() === key || keyFromCode(ev.code) === key;

  return (
    keyMatches &&
    ev.ctrlKey === wantCtrl &&
    ev.metaKey === wantMeta &&
    ev.shiftKey === wantShift &&
    ev.altKey === wantAlt
  );
}

export type DisposableContext = {
  ctx: AddonContext;
  dispose: () => void;
  keybinds: () => Array<string>;
};

export function createAddonContext(
  manifest: AddonManifest,
  store: Store<StateType>,
  bus: HookBus
): DisposableContext {
  const { id } = manifest;
  const disposers: Array<Disposer> = [];
  const patcher = createPatcher();
  const activeKeybinds = new Set<string>();

  function track(disposer: Disposer): Disposer {
    let done = false;
    const once = () => {
      if (done) {
        return;
      }
      done = true;
      const idx = disposers.indexOf(once);
      if (idx !== -1) {
        disposers.splice(idx, 1);
      }
      disposer();
    };
    disposers.push(once);
    return once;
  }

  const storagePrefix = `beacon-addon-${id}-`;

  const ctx: AddonContext = {
    id,

    // oxlint-disable-next-line no-console
    log: (...args) => console.log(`[Beacon:${id}]`, ...args),
    // oxlint-disable-next-line no-console
    warn: (...args) => console.warn(`[Beacon:${id}]`, ...args),
    // oxlint-disable-next-line no-console
    error: (...args) => console.error(`[Beacon:${id}]`, ...args),

    hooks: {
      on: (name, fn) => track(bus.on(name, fn)),
    },

    filters: {
      add: (name, fn) => track(addBeaconFilter(name, fn)),
      addAsync: (name, fn) => track(addBeaconAsyncFilter(name, fn)),
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

    notifications: {
      intercept: interceptor =>
        track(
          addBeaconFilter('notification.show', (show, info) =>
            show && interceptor(info) ? false : show
          )
        ),
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
      bodyClass: className => {
        document.body.classList.add(className);
        return track(() => document.body.classList.remove(className));
      },
    },

    keybinds: {
      register: (combo, fn) => {
        const handler = (ev: KeyboardEvent) => {
          if (ev.repeat || !matchesCombo(combo, ev)) {
            return;
          }
          ev.preventDefault();
          try {
            fn(ev);
          } catch (error) {
            logger.error(`${id}: keybind ${combo} error:`, error);
          }
        };
        document.addEventListener('keydown', handler);
        activeKeybinds.add(combo);
        return track(() => {
          document.removeEventListener('keydown', handler);
          activeKeybinds.delete(combo);
        });
      },
    },

    ui: {
      slot: (name, render) => track(registerSlot(name, render)),
      createModal: options => {
        let untrack: Disposer = () => undefined;
        const modal = createModal({
          ...options,
          onClose: () => {
            untrack();
            options.onClose?.();
          },
        });
        untrack = track(() => modal.close());
        return modal;
      },
      createElement,
      showNotification,
    },

    commands: {
      register: command =>
        track(commandRegistry.register({ ...command, addonId: id })),
      list: () => commandRegistry.list(),
      execute: (commandId, argsRaw) =>
        commandRegistry.execute(commandId, argsRaw),
    },

    storage: {
      get: <T>(key: string): T | undefined => {
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
      get: key => addonSettings.get(id, key),
      set: (key, value) => addonSettings.set(id, key, value),
      onChange: fn =>
        track(
          addonSettings.subscribe((addonId, key, value) => {
            if (addonId === id) {
              fn(key, value);
            }
          })
        ),
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
    for (const disposer of disposers.slice().reverse()) {
      try {
        disposer();
      } catch (error) {
        logger.error(`${id}: dispose error:`, error);
      }
    }
    disposers.length = 0;
  };

  return {
    ctx,
    dispose,
    keybinds: () => Array.from(activeKeybinds),
  };
}
