// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Proxy: route Signal's connections through an HTTP(S) or SOCKS proxy
 * (e.g. Tor at socks5h://127.0.0.1:9050). The address lives in the main
 * process (app/beacon.main.ts) because it must be known before anything
 * connects; the controls are on the Privacy tab.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';

export const ICON_PROXY = defineIcon([
  'M4 12h4',
  'M16 12h4',
  'M8 8h8v8H8z',
  'M12 4v4',
  'M12 16v4',
]);

export default {
  id: 'proxy',
  builtin: true,
  category: 'privacy',
  icon: ICON_PROXY,
  name: 'Proxy',
  version: '1.0.0',
  description:
    'Send Signal’s traffic through a proxy or Tor. Messages, attachments, contact lookup, link previews and updates go through it; calls do not — turn on Settings → Privacy → Advanced → Always relay calls to hide your IP from the other side.',
  authors: ['Beacon'],
  start() {
    // Controls live on the Privacy tab (BeaconPrivacyPage → ProxySection).
  },
} satisfies AddonManifest;
