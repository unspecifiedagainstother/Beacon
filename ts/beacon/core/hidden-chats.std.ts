// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Which conversations the chat list and search leave out. Read by the
 * left-pane and search selectors (ts/state/selectors/), written by the
 * hidden-chats built-in. The state object is replaced on every change, so
 * reselect sees a new input; the built-in then dispatches a no-op action to
 * make connected components re-run their selectors.
 */

export type HiddenChatsState = Readonly<{
  /** Conversation ids currently excluded from lists and search. */
  excluded: ReadonlySet<string>;
  /** Shown in the chat list, but with the message preview replaced. */
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

export const BEACON_HIDDEN_CHATS_CHANGED = 'beacon/HIDDEN_CHATS_CHANGED';
