// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type BeaconFeature = {
  readonly key: `beacon${string}`;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly defaultValue: boolean;
};

export const BEACON_FEATURES = [
  {
    key: 'beaconBlurPII',
    labelKey: 'icu:Preferences__blur-pii',
    descriptionKey: 'icu:Preferences__blur-pii--description',
    defaultValue: true,
  },
] as const satisfies ReadonlyArray<BeaconFeature>;

export type BeaconFeatureKey = (typeof BEACON_FEATURES)[number]['key'];

export const BEACON_FEATURE_KEYS = BEACON_FEATURES.map(
  feature => feature.key
) as ReadonlyArray<BeaconFeatureKey>;

export type BeaconMessageLogEntry = Readonly<{
  kind: 'deleted' | 'edited';
  messageId: string;
  conversationId: string;
  at: number;
  sentAt: number;
}>;

export type BeaconProfileField =
  | 'profileName'
  | 'username'
  | 'about'
  | 'avatar'
  | 'phone'
  | 'contactName'
  | 'groupName'
  | 'groupDescription';

export type BeaconProfileChange = Readonly<{
  conversationId: string;
  field: BeaconProfileField;
  at: number;
  from?: string;
  to?: string;
  fromThumb?: string;
  toThumb?: string;
  source: 'live' | 'startup';
}>;

export type BeaconProfileBaseline = Readonly<
  Record<
    string,
    Readonly<Partial<Record<BeaconProfileField | 'avatarThumb', string>>>
  >
>;

export type BeaconBookmark = Readonly<{
  messageId: string;
  conversationId: string;
  sentAt: number;
  addedAt: number;
  snapshot?: string;
  note?: string;
}>;

export type BeaconDataStorageKeys = {
  beaconMessageLog: ReadonlyArray<BeaconMessageLogEntry>;
  beaconProfileHistory: ReadonlyArray<BeaconProfileChange>;
  beaconProfileBaseline: BeaconProfileBaseline;
  beaconHiddenChats: ReadonlyArray<string>;
  beaconLockedChats: ReadonlyArray<string>;
  beaconBookmarks: ReadonlyArray<BeaconBookmark>;
};

export type BeaconStorageKeys = {
  [K in BeaconFeatureKey]: boolean;
} & BeaconDataStorageKeys;

export type BeaconSettingsType = Record<BeaconFeatureKey, boolean>;

export function getBeaconDefaults(): BeaconSettingsType {
  const result = {} as BeaconSettingsType;
  for (const feature of BEACON_FEATURES) {
    result[feature.key] = feature.defaultValue;
  }
  return result;
}
