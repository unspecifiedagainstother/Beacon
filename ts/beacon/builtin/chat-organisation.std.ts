// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Chat list organisation: more pinned chats and a collapsible Pinned
 * section (click the "Pinned" header). State in core/chat-list-state.std.ts.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { BEACON_STATE_CHANGED } from '../../state/ducks/beacon.std.ts';
import { defineIcon } from '../core/icons.std.ts';
import {
  CHAT_ORGANISATION_ID,
  DEFAULT_PIN_LIMIT,
  setChatListChangeNotifier,
} from '../core/chat-list-state.std.ts';

export const ICON_CHAT_ORGANISATION = defineIcon([
  'M12 17v5',
  'M9 3h6l-1 7 4 3H6l4-3z',
]);

export default {
  id: CHAT_ORGANISATION_ID,
  builtin: true,
  icon: ICON_CHAT_ORGANISATION,
  name: 'Chat list organisation',
  version: '1.0.0',
  description:
    'Pin more than 4 chats, and click the “Pinned” header in the chat list to collapse or expand it.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'pinLimit',
      type: 'number',
      symbol: 'pin',
      label: 'Maximum pinned chats',
      description:
        'Signal allows 4. Pins sync to your phone, which may show only its own limit.',
      min: 4,
      max: 200,
      defaultValue: DEFAULT_PIN_LIMIT,
    },
  ],

  start(ctx) {
    setChatListChangeNotifier(() =>
      ctx.redux.dispatch({ type: BEACON_STATE_CHANGED })
    );
    ctx.onDispose(() => setChatListChangeNotifier(undefined));
  },
} satisfies AddonManifest;
