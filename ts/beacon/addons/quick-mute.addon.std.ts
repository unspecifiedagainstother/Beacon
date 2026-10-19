// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { getSelectedConversationId } from '../../state/selectors/nav.std.ts';

const MUTE_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // ~1 year

/**
 * Quick Mute — mod+m toggles mute via the real action.
 */
export default {
  id: 'quick-mute',
  name: 'Quick Mute',
  version: '2.0.0',
  description: 'Ctrl/⌘+M toggles mute on the open conversation.',
  authors: ['Beacon'],
  tags: ['utility'],
  start(ctx) {
    ctx.keybinds.register('mod+m', () => {
      const state = ctx.redux.getState();
      const conversationId = getSelectedConversationId(state);
      if (!conversationId) {
        ctx.ui.showNotification('No active conversation', 'warning');
        return;
      }

      const conversation =
        state.conversations.conversationLookup[conversationId];
      const isMuted = (conversation?.muteExpiresAt ?? 0) > Date.now();

      ctx.signal.reduxActions.conversations.setMuteDuration(
        conversationId,
        isMuted ? 0 : MUTE_DURATION_MS
      );
      ctx.ui.showNotification(isMuted ? 'Unmuted' : 'Muted', 'success');
    });

    ctx.log('quick mute active');
  },
} satisfies AddonManifest;
