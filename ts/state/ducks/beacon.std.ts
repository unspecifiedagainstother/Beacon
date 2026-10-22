// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A tiny Redux slice whose only job is to change when Beacon state that
 * selectors read from outside Redux (hidden chats, collapsed Pinned
 * section, ...) changes. Selectors that start from the whole state object
 * (state => state) only recompute when some slice is replaced; bumping
 * this version does that.
 */

import type { ReadonlyDeep } from 'type-fest';

export type BeaconStateType = ReadonlyDeep<{ version: number }>;

export const BEACON_STATE_CHANGED = 'beacon/STATE_CHANGED';

type BeaconStateChangedAction = ReadonlyDeep<{
  type: typeof BEACON_STATE_CHANGED;
}>;

export function getEmptyState(): BeaconStateType {
  return { version: 0 };
}

export function reducer(
  state: BeaconStateType = getEmptyState(),
  action: Readonly<{ type: string }>
): BeaconStateType {
  if (action.type === BEACON_STATE_CHANGED) {
    return { version: state.version + 1 };
  }
  return state;
}

export function beaconStateChanged(): BeaconStateChangedAction {
  return { type: BEACON_STATE_CHANGED };
}
