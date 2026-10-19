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
