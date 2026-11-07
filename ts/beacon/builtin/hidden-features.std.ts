// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Hidden Signal features: switches for things that exist in Signal's code
 * but are held back by rollouts or limited to Signal staff. The switches
 * are read directly by the code they unlock (core/hidden-features.std.ts);
 * this manifest only declares them so they show in settings.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import {
  HIDDEN_FEATURE_DEFAULTS,
  HIDDEN_FEATURES_ID,
} from '../core/hidden-features.std.ts';

export const ICON_HIDDEN_FEATURES = defineIcon([
  'M12 3l8 4v5c0 4.4-3.4 8-8 9-4.6-1-8-4.6-8-9V7z',
  'M9 12l2 2 4-4',
]);

const d = HIDDEN_FEATURE_DEFAULTS;

export default {
  id: HIDDEN_FEATURES_ID,
  builtin: true,
  icon: ICON_HIDDEN_FEATURES,
  name: 'Hidden Signal features',
  version: '1.0.0',
  description:
    'Turn on features that are already in Signal but not yet released to everyone, or only shown to Signal staff. Some take effect after a restart.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'disappearingCalls',
      type: 'toggle',
      symbol: 'timer',
      label: 'Disappearing call logs',
      description:
        'Call entries in a chat follow its disappearing-messages timer.',
      defaultValue: d.disappearingCalls,
    },
    {
      key: 'keyTransparency',
      type: 'toggle',
      symbol: 'shield-check',
      label: 'Key transparency',
      description:
        'Automatically checks that contacts’ keys are the ones Signal’s directory publishes (also shown with the safety number). Restart to apply.',
      defaultValue: d.keyTransparency,
    },
    {
      key: 'callingSettings',
      type: 'toggle',
      symbol: 'phone',
      label: 'Advanced calling settings',
      description:
        'Adds Settings → Calling: bitrate, call server (SFU) address, VP9, SVC video modes, audio redundancy.',
      defaultValue: d.callingSettings,
    },
    {
      key: 'storyDownload',
      type: 'toggle',
      symbol: 'download',
      label: 'Download other people’s stories',
      description: 'Adds Download to the story details menu.',
      defaultValue: d.storyDownload,
    },
    {
      key: 'profileDetails',
      type: 'toggle',
      symbol: 'person',
      label: 'Detailed profiles',
      description:
        'Shows everything known about a contact (IDs, sealed sender, safety number state, capabilities, history) in their About page.',
      defaultValue: d.profileDetails,
    },
    {
      key: 'developerMode',
      type: 'toggle',
      symbol: 'cube',
      label: 'Developer mode',
      description:
        'Right-click a chat or message for a Developer section: copy IDs, phone number, username and the raw data as JSON.',
      defaultValue: d.developerMode,
    },
  ],

  start() {
    // Nothing to run: the switches are read where they apply.
  },
} satisfies AddonManifest;
