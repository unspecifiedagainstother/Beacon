// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Filter registry — the synchronous counterpart to the hook bus.
 *
 * Upstream code calls applyBeaconFilter() at a handful of fixed points (see
 * FilterPayloads in types.dom.ts for the list and where each one lives).
 * Every registered filter gets the current value plus read-only context and
 * may return a replacement. A throwing filter is logged and skipped, so a
 * broken addon can never break the upstream code path it sits in.
 *
 * This file is .std on purpose: it is imported from upstream preload and dom
 * modules alike, so it must not depend on either.
 */

import { createLogger } from '../../logging/log.std.ts';
import type {
  Disposer,
  FilterFn,
  FilterName,
  FilterPayloads,
} from './types.dom.ts';

const log = createLogger('beacon/filters');

const filters = new Map<FilterName, Set<FilterFn>>();

export function addBeaconFilter<Name extends FilterName>(
  name: Name,
  fn: FilterFn<Name>
): Disposer {
  let set = filters.get(name);
  if (!set) {
    set = new Set();
    filters.set(name, set);
  }
  set.add(fn as unknown as FilterFn);
  return () => {
    filters.get(name)?.delete(fn as unknown as FilterFn);
  };
}

export function applyBeaconFilter<Name extends FilterName>(
  name: Name,
  value: FilterPayloads[Name][0],
  context: FilterPayloads[Name][1]
): FilterPayloads[Name][0] {
  const set = filters.get(name);
  if (!set || set.size === 0) {
    return value;
  }

  let current = value;
  for (const fn of Array.from(set)) {
    try {
      const result = (fn as unknown as FilterFn<Name>)(current, context);
      if (result !== undefined) {
        current = result;
      }
    } catch (error) {
      log.error(`filter ${name} threw:`, error);
    }
  }
  return current;
}

export function filterCount(name: FilterName): number {
  return filters.get(name)?.size ?? 0;
}
