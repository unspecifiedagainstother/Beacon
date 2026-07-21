// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';

/**
 * Ghost Mode — intercepts typing indicators before they leave.
 * Patches Conversation.sendTypingMessage so typing never sends.
 *
 * Honest scope: only blocks outgoing typing. Read receipts still work.
 * Use Signal's own privacy settings for message-level control.
 */
export default {
  id: 'ghost-mode',
  name: 'Ghost Mode',
  version: '2.0.0',
  description:
    'Block outgoing typing indicators (read receipts still work — use Prefs)',
  start(ctx) {
    const cc = ctx.signal.conversationController;
    if (!cc) {
      ctx.error('ConversationController not available');
      return;
    }

    // Patch sendTypingMessage on the prototype so all conversation
    // instances get it. Return early to no-op the send.
    ctx.patcher.instead(
      cc.constructor.prototype,
      'sendTypingMessage',
      () => undefined
    );

    ctx.ui.showNotification('Ghost mode: typing blocked', 'success');
    ctx.log('sendTypingMessage patched');
  },
} satisfies AddonManifest;
