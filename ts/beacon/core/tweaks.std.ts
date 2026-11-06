// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type BeaconTweaks = {
  playbackRates: ReadonlyArray<number>;
  defaultPlaybackRate: number;
  typingLabel?: (
    contactIds: ReadonlyArray<string>,
    conversationType: string
  ) => string | undefined;
  formatMessageTime?: (timestamp: number, now: number) => string | undefined;
  messageTimeTitle?: (timestamp: number) => string | undefined;
  navDrawer: boolean;
};

export const DEFAULT_PLAYBACK_RATES: ReadonlyArray<number> = [1, 1.5, 2, 0.5];

export const beaconTweaks: BeaconTweaks = {
  playbackRates: DEFAULT_PLAYBACK_RATES,
  defaultPlaybackRate: 1,
  navDrawer: true,
};

export function nextPlaybackRate(current: number): number {
  const rates = beaconTweaks.playbackRates.length
    ? beaconTweaks.playbackRates
    : DEFAULT_PLAYBACK_RATES;
  const index = rates.indexOf(current);
  return rates[(index + 1) % rates.length] ?? 1;
}
