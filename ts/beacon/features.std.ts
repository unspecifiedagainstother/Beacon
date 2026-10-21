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
    // On by default, deliberately: an exception to the rule below. A phone
    // number leaking during a screen share cannot be taken back.
    defaultValue: true,
  },
] as const satisfies ReadonlyArray<BeaconFeature>;

/** Union of every Beacon storage key, e.g. `'beaconBlurPII'`. */
export type BeaconFeatureKey = (typeof BEACON_FEATURES)[number]['key'];

/** Runtime list of keys, for iterating and for the storage unlink policy. */
export const BEACON_FEATURE_KEYS = BEACON_FEATURES.map(
  feature => feature.key
) as ReadonlyArray<BeaconFeatureKey>;

/**
 * Message-logger index entry. IDs and timestamps only — the retained content
 * itself lives on the message (`beaconDeleted`, `editHistory`).
 */
export type BeaconMessageLogEntry = Readonly<{
  kind: 'deleted' | 'edited';
  messageId: string;
  conversationId: string;
  /** When the delete/edit was observed. */
  at: number;
  /** Original send time of the message, for jump-to-message. */
  sentAt: number;
}>;

/**
 * Non-toggle Beacon data kept in items storage — i.e. inside the encrypted
 * database, unlike addon localStorage. Not preserved across unlink.
 */
export type BeaconProfileField =
  | 'profileName'
  | 'username'
  | 'about'
  | 'avatar'
  | 'phone'
  | 'contactName'
  | 'groupName'
  | 'groupDescription';

/** One observed change to a contact's or group's profile. */
export type BeaconProfileChange = Readonly<{
  conversationId: string;
  field: BeaconProfileField;
  at: number;
  from?: string;
  to?: string;
  /** Small JPEG data URLs for avatar changes, when the image was readable. */
  fromThumb?: string;
  toThumb?: string;
  /** 'startup' = changed while Beacon was closed, noticed at launch. */
  source: 'live' | 'startup';
}>;

/** Last seen value of each tracked field, per conversation. */
export type BeaconProfileBaseline = Readonly<
  Record<
    string,
    Readonly<Partial<Record<BeaconProfileField | 'avatarThumb', string>>>
  >
>;

export type BeaconDataStorageKeys = {
  beaconMessageLog: ReadonlyArray<BeaconMessageLogEntry>;
  beaconProfileHistory: ReadonlyArray<BeaconProfileChange>;
  beaconProfileBaseline: BeaconProfileBaseline;
  /** Conversation ids hidden from the chat list and search. */
  beaconHiddenChats: ReadonlyArray<string>;
  /** Conversation ids that need the passphrase to open. */
  beaconLockedChats: ReadonlyArray<string>;
};

/** Shape mixed into StorageAccessType so each key is typed. */
export type BeaconStorageKeys = {
  [K in BeaconFeatureKey]: boolean;
} & BeaconDataStorageKeys;

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
