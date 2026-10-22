// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Chat-list organisation state (built-in "Chat list organisation"):
 * collapsible Pinned section and a higher pin limit. Read by the left-pane
 * selector and LeftPaneInboxHelper; persisted in the addon settings store.
 */

import { addonSettings } from './settings.std.ts';

export const CHAT_ORGANISATION_ID = 'chat-organisation';
export const DEFAULT_PIN_LIMIT = 20;

export type ChatListState = Readonly<{ pinnedCollapsed: boolean }>;

let state: ChatListState = {
  pinnedCollapsed:
    addonSettings.get(CHAT_ORGANISATION_ID, 'pinnedCollapsed') === true,
};
let notify: (() => void) | undefined;

/** Selector input: a new object whenever something changes. */
export function getChatListState(): ChatListState {
  return state;
}

export function setChatListChangeNotifier(fn: (() => void) | undefined): void {
  notify = fn;
}

export function togglePinnedCollapsed(): void {
  state = { ...state, pinnedCollapsed: !state.pinnedCollapsed };
  addonSettings.set(
    CHAT_ORGANISATION_ID,
    'pinnedCollapsed',
    state.pinnedCollapsed
  );
  notify?.();
}

export function getBeaconPinLimit(): number {
  const value = addonSettings.get(CHAT_ORGANISATION_ID, 'pinLimit');
  return typeof value === 'number' && value > 0 ? value : DEFAULT_PIN_LIMIT;
}
