// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { noop } from 'lodash';

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
  start: noop,
} satisfies AddonManifest;
