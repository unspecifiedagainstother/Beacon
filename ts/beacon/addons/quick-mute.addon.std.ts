// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_QUICK_MUTE } from './icons.std.ts';
import { MuteExpiration } from '@signalapp/types';
import { getSelectedConversationId } from '../../state/selectors/nav.std.ts';
import { isConversationMuted } from '../../util/isConversationMuted.std.ts';

export default {
  id: 'quick-mute',
  icon: ICON_QUICK_MUTE,
  name: 'Quick Mute',
  version: '2.0.0',
  description: 'Ctrl/⌘+Alt+M toggles mute on the open conversation.',
  authors: ['Beacon'],
  tags: ['utility'],
  start(ctx) {
    ctx.keybinds.register('mod+alt+m', () => {
      const state = ctx.redux.getState();
      const conversationId = getSelectedConversationId(state);
      if (!conversationId) {
        ctx.ui.showNotification('No active conversation', 'warning');
        return;
      }

      const conversation =
        state.conversations.conversationLookup[conversationId];
      const isMuted = conversation ? isConversationMuted(conversation) : false;

      ctx.signal.reduxActions.conversations.setMuteExpiration(
        conversationId,
        isMuted ? MuteExpiration.UNMUTED : MuteExpiration.ALWAYS
      );
      ctx.ui.showNotification(isMuted ? 'Unmuted' : 'Muted', 'success');
    });

    ctx.log('quick mute active');
  },
} satisfies AddonManifest;
