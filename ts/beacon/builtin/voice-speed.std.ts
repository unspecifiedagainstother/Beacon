// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Voice-message speed: which speeds the 1×/1.5×/2× button cycles through,
 * and the speed for chats where you haven't picked one (Signal remembers a
 * speed per chat once you change it).
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { beaconTweaks, DEFAULT_PLAYBACK_RATES } from '../core/tweaks.std.ts';

export const ICON_VOICE_SPEED = defineIcon([
  'M12 3a9 9 0 1 0 9 9',
  'M12 12l5-5',
  'M16 3h5v5',
]);

const SETS: Record<string, ReadonlyArray<number>> = {
  signal: DEFAULT_PLAYBACK_RATES,
  fine: [1, 1.25, 1.5, 1.75, 2, 0.75],
  fast: [1, 1.5, 2, 2.5, 3],
  all: [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 0.5, 0.75],
};

export default {
  id: 'voice-speed',
  builtin: true,
  icon: ICON_VOICE_SPEED,
  name: 'Voice message speed',
  version: '1.0.0',
  description: 'More playback speeds for voice messages, and a default speed.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'speeds',
      type: 'select',
      symbol: 'audio',
      label: 'Speeds to cycle through',
      options: [
        { value: 'signal', label: '1×, 1.5×, 2×, 0.5× (Signal)' },
        { value: 'fine', label: '1× – 2× in quarter steps, 0.75×' },
        { value: 'fast', label: '1× – 3×' },
        { value: 'all', label: 'All: 0.5× – 3×' },
      ],
      defaultValue: 'fine',
    },
    {
      key: 'defaultRate',
      type: 'select',
      symbol: 'play',
      label: 'Default speed',
      description: 'For chats where you haven’t chosen one.',
      options: ['0.75', '1', '1.25', '1.5', '1.75', '2'].map(value => ({
        value,
        label: `${value}×`,
      })),
      defaultValue: '1',
    },
  ],

  start(ctx) {
    const sync = () => {
      beaconTweaks.playbackRates =
        SETS[ctx.settings.get<string>('speeds')] ?? DEFAULT_PLAYBACK_RATES;
      const rate = Number(ctx.settings.get<string>('defaultRate'));
      beaconTweaks.defaultPlaybackRate =
        Number.isFinite(rate) && rate > 0 ? rate : 1;
    };
    sync();
    ctx.settings.onChange(sync);
    ctx.onDispose(() => {
      beaconTweaks.playbackRates = DEFAULT_PLAYBACK_RATES;
      beaconTweaks.defaultPlaybackRate = 1;
    });
  },
} satisfies AddonManifest;
