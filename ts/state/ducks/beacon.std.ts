// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

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
