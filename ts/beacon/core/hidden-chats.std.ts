// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type HiddenChatsState = Readonly<{
  excluded: ReadonlySet<string>;
  redacted: ReadonlySet<string>;
}>;

const EMPTY: HiddenChatsState = { excluded: new Set(), redacted: new Set() };

let state: HiddenChatsState = EMPTY;

export function getHiddenChatsState(): HiddenChatsState {
  return state;
}

export function setHiddenChatsState(next: {
  excluded: Iterable<string>;
  redacted: Iterable<string>;
}): void {
  state = {
    excluded: new Set(next.excluded),
    redacted: new Set(next.redacted),
  };
}
