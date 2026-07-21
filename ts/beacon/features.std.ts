// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Beacon feature registry — the single place to add a Beacon setting.
 *
 * Adding a boolean feature used to mean ~10 edits across 4 files, most of them
 * upstream (rebase conflicts every sync). Now:
 *
 *   1. add an entry to BEACON_FEATURES below
 *   2. add the two i18n strings to _locales/en/messages.json
 *
 * That's it. The storage key, the unlink policy, the Settings checkbox, the
 * redux wiring and the Storybook props are all derived from this array, so the
 * upstream files stay at a fixed, small diff no matter how many features exist.
 *
 * Consumers:
 *   ts/types/StorageKeys.std.ts        - storage key type + unlink policy
 *   ts/components/Preferences.dom.tsx  - renders the Beacon settings page
 *   ts/state/smart/Preferences.preload.tsx - reads/writes via items storage
 */

export type BeaconFeature = {
  /**
   * Storage key. Must start with `beacon` so it is obvious in the DB and cannot
   * collide with an upstream key.
   */
  readonly key: `beacon${string}`;
  /** i18n key for the checkbox label. */
  readonly labelKey: string;
  /** i18n key for the explanatory text under the label. */
  readonly descriptionKey: string;
  /**
   * Value used before the user has ever set it.
   *
   * Prefer `false` for anything that changes behaviour. A privacy feature that
   * defaults on is a nice idea, but it also means a Beacon build behaves
   * differently from Signal in ways the user did not ask for — make it a
   * deliberate choice instead.
   */
  readonly defaultValue: boolean;
};

export const BEACON_FEATURES = [
  {
    key: 'beaconBlurPII',
    labelKey: 'icu:Preferences__blur-pii',
    descriptionKey: 'icu:Preferences__blur-pii--description',
    defaultValue: false,
  },
] as const satisfies ReadonlyArray<BeaconFeature>;

/** Union of every Beacon storage key, e.g. `'beaconBlurPII'`. */
export type BeaconFeatureKey = (typeof BEACON_FEATURES)[number]['key'];

/** Runtime list of keys, for iterating and for the storage unlink policy. */
export const BEACON_FEATURE_KEYS = BEACON_FEATURES.map(
  feature => feature.key
) as ReadonlyArray<BeaconFeatureKey>;

/** Shape mixed into StorageAccessType so each key is a typed boolean. */
export type BeaconStorageKeys = {
  [K in BeaconFeatureKey]: boolean;
};

/** Current value of every Beacon feature, as passed to the Preferences UI. */
export type BeaconSettingsType = Record<BeaconFeatureKey, boolean>;

/** Defaults, for Storybook and for any code that needs a complete object. */
export function getBeaconDefaults(): BeaconSettingsType {
  const result = {} as BeaconSettingsType;
  for (const feature of BEACON_FEATURES) {
    result[feature.key] = feature.defaultValue;
  }
  return result;
}
