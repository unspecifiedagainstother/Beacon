// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Vencord-style runtime function patcher.
 *
 * Lets an addon wrap any method on any live object: run code before it (and
 * rewrite the arguments), after it (and rewrite the return value), or replace
 * it entirely while keeping a handle to the original.
 *
 * Multiple patches on the same method stack; disposing one splices it out
 * without disturbing the others. Each addon gets its own Patcher instance so
 * disabling the addon can unpatch everything it touched.
 */

/* oxlint-disable no-param-reassign -- patching mutates the target by design */

import { createLogger } from '../../logging/log.std.ts';
import type {
  Disposer,
  PatchCallbackAfter,
  PatchCallbackBefore,
  PatchCallbackInstead,
  Patcher,
} from './types.dom.ts';

const log = createLogger('beacon/patcher');

type AnyFn = (...args: Array<unknown>) => unknown;

type PatchEntry = {
  befores: Array<PatchCallbackBefore>;
  insteads: Array<PatchCallbackInstead>;
  afters: Array<PatchCallbackAfter>;
  original: AnyFn;
  proxy: AnyFn;
};

// Shared across all Patcher instances so two addons patching the same method
// stack on one proxy instead of wrapping each other's wrappers.
const patchedMethods = new WeakMap<object, Map<string, PatchEntry>>();

function getOrCreateEntry(obj: object, method: string): PatchEntry {
  let byMethod = patchedMethods.get(obj);
  if (!byMethod) {
    byMethod = new Map();
    patchedMethods.set(obj, byMethod);
  }

  const existing = byMethod.get(method);
  if (existing) {
    return existing;
  }

  const original = (obj as Record<string, unknown>)[method];
  if (typeof original !== 'function') {
    throw new Error(`[Beacon] patcher: ${method} is not a function`);
  }

  const entry: PatchEntry = {
    befores: [],
    insteads: [],
    afters: [],
    original: original as AnyFn,
    proxy: () => undefined,
  };

  entry.proxy = function patchedProxy(this: unknown, ...args: Array<unknown>) {
    let callArgs = args;

    // before/after callbacks are guarded: a broken addon must not break the
    // patched upstream method. `instead` is not — it owns the call.
    for (const before of Array.from(entry.befores)) {
      try {
        const replaced = before(callArgs);
        if (Array.isArray(replaced)) {
          callArgs = replaced;
        }
      } catch (error) {
        log.error(`before-patch on ${method} threw:`, error);
      }
    }

    const boundOriginal = entry.original.bind(this);
    let result: unknown;
    if (entry.insteads.length > 0) {
      // Chain insteads: each receives "call the rest" as its original.
      const chain = entry.insteads.reduceRight<AnyFn>(
        (nextFn, instead) =>
          (...a: Array<unknown>) =>
            instead(a, nextFn),
        boundOriginal
      );
      result = chain(...callArgs);
    } else {
      result = boundOriginal(...callArgs);
    }

    for (const after of Array.from(entry.afters)) {
      try {
        const replaced = after(result, callArgs);
        if (replaced !== undefined) {
          result = replaced;
        }
      } catch (error) {
        log.error(`after-patch on ${method} threw:`, error);
      }
    }

    return result;
  };

  (obj as Record<string, unknown>)[method] = entry.proxy;
  byMethod.set(method, entry);
  return entry;
}

function maybeRestore(obj: object, method: string, entry: PatchEntry): void {
  if (
    entry.befores.length === 0 &&
    entry.insteads.length === 0 &&
    entry.afters.length === 0
  ) {
    // Only restore if nobody re-patched over our proxy in the meantime.
    if ((obj as Record<string, unknown>)[method] === entry.proxy) {
      (obj as Record<string, unknown>)[method] = entry.original;
    }
    patchedMethods.get(obj)?.delete(method);
  }
}

export function createPatcher(): Patcher {
  const disposers = new Set<Disposer>();

  function track(disposer: Disposer): Disposer {
    const wrapped = () => {
      disposers.delete(wrapped);
      disposer();
    };
    disposers.add(wrapped);
    return wrapped;
  }

  return {
    before(obj, method, cb) {
      const entry = getOrCreateEntry(obj, method);
      entry.befores.push(cb);
      return track(() => {
        const idx = entry.befores.indexOf(cb);
        if (idx !== -1) {
          entry.befores.splice(idx, 1);
        }
        maybeRestore(obj, method, entry);
      });
    },

    after(obj, method, cb) {
      const entry = getOrCreateEntry(obj, method);
      entry.afters.push(cb);
      return track(() => {
        const idx = entry.afters.indexOf(cb);
        if (idx !== -1) {
          entry.afters.splice(idx, 1);
        }
        maybeRestore(obj, method, entry);
      });
    },

    instead(obj, method, cb) {
      const entry = getOrCreateEntry(obj, method);
      entry.insteads.push(cb);
      return track(() => {
        const idx = entry.insteads.indexOf(cb);
        if (idx !== -1) {
          entry.insteads.splice(idx, 1);
        }
        maybeRestore(obj, method, entry);
      });
    },

    unpatchAll() {
      for (const dispose of Array.from(disposers)) {
        dispose();
      }
    },
  };
}
