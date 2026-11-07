// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../../logging/log.std.ts';
import type { Disposer, HookFn, HookName, HookPayloads } from './types.dom.ts';

const log = createLogger('beacon/hooks');

export class HookBus {
  readonly #hooks = new Map<HookName, Set<HookFn>>();

  on<Name extends HookName>(name: Name, fn: HookFn<Name>): Disposer {
    let set = this.#hooks.get(name);
    if (!set) {
      set = new Set();
      this.#hooks.set(name, set);
    }
    set.add(fn as HookFn);
    return () => {
      this.#hooks.get(name)?.delete(fn as HookFn);
    };
  }

  emit<Name extends HookName>(name: Name, ...args: HookPayloads[Name]): void {
    const set = this.#hooks.get(name);
    if (!set || set.size === 0) {
      return;
    }
    for (const fn of Array.from(set)) {
      try {
        const result = (fn as HookFn<Name>)(...args);
        if (result instanceof Promise) {
          void (async () => {
            try {
              await result;
            } catch (error) {
              log.error(`async hook ${name} error:`, error);
            }
          })();
        }
      } catch (error) {
        log.error(`hook ${name} error:`, error);
      }
    }
  }

  listenerCount(name: HookName): number {
    return this.#hooks.get(name)?.size ?? 0;
  }

  clear(): void {
    this.#hooks.clear();
  }
}
