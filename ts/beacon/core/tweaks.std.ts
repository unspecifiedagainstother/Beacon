// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Small render-time knobs read by upstream components. Built-ins set them;
 * components read them while rendering, so a change shows on the next
 * render (timestamps refresh every minute, lists on any update).
 *
 * Kept .std and dependency-free: imported from dom components and preload
 * selectors alike.
 */

export type BeaconTweaks = {
  /** Voice-message speeds the rate button cycles through. */
  playbackRates: ReadonlyArray<number>;
  /** Speed for chats where you haven't picked one. */
  defaultPlaybackRate: number;
  /** "Alice is typing" text for the chat list; undefined = dots only. */
  typingLabel?: (
    contactIds: ReadonlyArray<string>,
    conversationType: string
  ) => string | undefined;
  /** Message time label; undefined = Signal's relative format. */
  formatMessageTime?: (timestamp: number, now: number) => string | undefined;
  /** Hover text on message times. */
  messageTimeTitle?: (timestamp: number) => string | undefined;
};

export const DEFAULT_PLAYBACK_RATES: ReadonlyArray<number> = [1, 1.5, 2, 0.5];

export const beaconTweaks: BeaconTweaks = {
  playbackRates: DEFAULT_PLAYBACK_RATES,
  defaultPlaybackRate: 1,
};

export function nextPlaybackRate(current: number): number {
  const rates = beaconTweaks.playbackRates.length
    ? beaconTweaks.playbackRates
    : DEFAULT_PLAYBACK_RATES;
  const index = rates.indexOf(current);
  return rates[(index + 1) % rates.length] ?? 1;
}
