// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../../logging/log.std.ts';
import type {
  AsyncFilterFn,
  AsyncFilterName,
  AsyncFilterPayloads,
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

const asyncFilters = new Map<AsyncFilterName, Set<AsyncFilterFn>>();

export function addBeaconAsyncFilter<Name extends AsyncFilterName>(
  name: Name,
  fn: AsyncFilterFn<Name>
): Disposer {
  let set = asyncFilters.get(name);
  if (!set) {
    set = new Set();
    asyncFilters.set(name, set);
  }
  set.add(fn as unknown as AsyncFilterFn);
  return () => {
    asyncFilters.get(name)?.delete(fn as unknown as AsyncFilterFn);
  };
}

export async function applyBeaconAsyncFilter<Name extends AsyncFilterName>(
  name: Name,
  value: AsyncFilterPayloads[Name][0],
  context: AsyncFilterPayloads[Name][1]
): Promise<AsyncFilterPayloads[Name][0]> {
  const set = asyncFilters.get(name);
  if (!set || set.size === 0) {
    return value;
  }

  let current = value;
  for (const fn of Array.from(set)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each filter sees the last one's result
      const result = await (fn as unknown as AsyncFilterFn<Name>)(
        current,
        context
      );
      if (result !== undefined) {
        current = result;
      }
    } catch (error) {
      log.error(`async filter ${name} threw:`, error);
    }
  }
  return current;
}
