// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Switches for Signal features that exist in the code but are held back by
 * remote-config rollouts or limited to internal (Signal staff) builds.
 *
 * Read synchronously from the addon settings store (localStorage), so they
 * work during startup before the hidden-features built-in has started; the
 * built-in only declares them for the settings UI.
 */

import { addonSettings } from './settings.std.ts';

export const HIDDEN_FEATURES_ID = 'hidden-features';

export const HIDDEN_FEATURE_DEFAULTS = {
  disappearingCalls: true,
  keyTransparency: true,
  callingSettings: true,
  storyDownload: true,
  profileDetails: true,
  developerMode: false,
};

export type HiddenFeature = keyof typeof HIDDEN_FEATURE_DEFAULTS;

export function isHiddenFeatureOn(feature: HiddenFeature): boolean {
  const value = addonSettings.get(HIDDEN_FEATURES_ID, feature);
  return typeof value === 'boolean' ? value : HIDDEN_FEATURE_DEFAULTS[feature];
}

/** Remote-config rollout keys a Beacon switch can force on. */
const ROLLOUT_KEYS: Record<string, HiddenFeature> = {
  'desktop.disappearingCalls.beta': 'disappearingCalls',
  'desktop.disappearingCalls.prod': 'disappearingCalls',
  'desktop.keyTransparency.beta': 'keyTransparency',
  'desktop.keyTransparency.prod': 'keyTransparency',
};

export function isRolloutForcedOn(key: string): boolean {
  const feature = ROLLOUT_KEYS[key];
  return feature !== undefined && isHiddenFeatureOn(feature);
}
