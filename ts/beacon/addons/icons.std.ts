// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Icons for the builtin addons. 24×24 outline glyphs built with defineIcon();
 * any addon can do the same, or set `icon` to raw `<svg>` markup.
 */

import { defineIcon } from '../core/icons.std.ts';

export const ICON_MESSAGE_LOGGER = defineIcon([
  // Speech bubble with a history clock hand.
  'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  'M12 8v4l2.5 1.5',
]);

export const ICON_GHOST_MODE = defineIcon([
  'M5 20V10a7 7 0 0 1 14 0v10l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2z',
  'M9.5 10h.01',
  'M14.5 10h.01',
]);

export const ICON_CLEAR_URLS = defineIcon([
  // Link with a slash through it.
  'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.2 1.2',
  'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.2-1.2',
  'M3 3l18 18',
]);

export const ICON_NOTIFICATION_FILTER = defineIcon([
  // Funnel.
  'M3 4h18l-7 8.5V19l-4 2v-8.5z',
]);

export const ICON_QUICK_MUTE = defineIcon([
  // Bell with a slash.
  'M6 8a6 6 0 0 1 9.3-5',
  'M18 8.5c0 6 2.5 8.5 2.5 8.5H6',
  'M3.5 17S6 15 6 10',
  'M10.3 21a2 2 0 0 0 3.4 0',
  'M3 3l18 18',
]);

export const ICON_FOCUS_MODE = defineIcon([
  // Corner brackets around a dot.
  'M4 8V4h4',
  'M16 4h4v4',
  'M20 16v4h-4',
  'M8 20H4v-4',
  'M12 11.5a.5.5 0 1 0 0 1 .5.5 0 1 0 0-1z',
]);

export const ICON_STATS_DASHBOARD = defineIcon([
  'M4 20V10',
  'M10 20V4',
  'M16 20v-7',
  'M22 20H2',
]);

export const ICON_READ_ALL = defineIcon([
  // Double check mark.
  'M2 12.5l4.5 4.5L15 8.5',
  'M10.5 15.5L12 17l9-9',
]);

export const ICON_BLUR_MEDIA = defineIcon([
  // Picture frame with a mountain, plus blur dots.
  'M4 4h16v16H4z',
  'M4 16l5-5 4 4 2-2 5 5',
  'M15.5 8.5h.01',
]);

export const ICON_PRIVACY_SCREEN = defineIcon([
  // Monitor with a closed eye.
  'M3 4h18v12H3z',
  'M8 20h8',
  'M12 16v4',
  'M8 9.5c2.5 2.5 5.5 2.5 8 0',
]);

export const ICON_COMPACT_MODE = defineIcon([
  // Stacked dense rows.
  'M4 6h16',
  'M4 10h16',
  'M4 14h16',
  'M4 18h16',
]);

export const ICON_TEXT_REPLACE = defineIcon([
  // Two arrows swapping.
  'M4 7h13l-3-3',
  'M20 17H7l3 3',
]);

export const ICON_SNIPPETS = defineIcon([
  // Clipboard with lines.
  'M8 4H6v17h12V4h-2',
  'M8 2h8v4H8z',
  'M9 11h6',
  'M9 15h4',
]);

export const ICON_TEXT_FACES = defineIcon([
  // Smiley.
  'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z',
  'M8.5 14.5a4.5 4.5 0 0 0 7 0',
  'M9 9.5h.01',
  'M15 9.5h.01',
]);
