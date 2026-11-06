// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { beaconTweaks } from '../core/tweaks.std.ts';
import { beaconStateChanged } from '../../state/ducks/beacon.std.ts';

export const BEACON_LOOK_ID = 'beacon-look';

export const ICON_BEACON_LOOK = defineIcon([
  'M4 4h16v16H4z',
  'M4 9h16',
  'M9 9v11',
]);

export default {
  id: BEACON_LOOK_ID,
  builtin: true,
  icon: ICON_BEACON_LOOK,
  name: 'Look',
  version: '1.0.0',
  description:
    'Squarer, consistent corners everywhere — dialogs, buttons, tabs and cards — and a Telegram-style menu instead of the side tab bar.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'squareCorners',
      type: 'toggle',
      symbol: 'appearance',
      label: 'Squarer corners across the app',
      defaultValue: true,
    },
    {
      key: 'navDrawer',
      type: 'toggle',
      symbol: 'list-bullet',
      label: 'Menu button instead of the side tab bar',
      description:
        'Telegram-style: ☰ in the chat list opens Chats, Calls, Stories, Settings and shortcuts.',
      defaultValue: true,
    },
  ],

  start(ctx) {
    let dispose: (() => void) | undefined;
    const sync = () => {
      const on = ctx.settings.get<boolean>('squareCorners');
      if (on && !dispose) {
        dispose = ctx.css.bodyClass('beacon-square');
      } else if (!on && dispose) {
        dispose();
        dispose = undefined;
      }
    };
    const syncNav = () => {
      const on = ctx.settings.get<boolean>('navDrawer') ?? true;
      if (beaconTweaks.navDrawer !== on) {
        beaconTweaks.navDrawer = on;
        ctx.redux.dispatch(beaconStateChanged());
      }
    };
    sync();
    syncNav();
    ctx.settings.onChange(() => {
      sync();
      syncNav();
    });
  },
} satisfies AddonManifest;
