// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Read All — mark every conversation read at once (/readall or
 * Ctrl/⌘+Alt+R).
 *
 * Uses each conversation's own markRead, so read syncs go to your linked
 * devices and read receipts follow your Privacy setting (and Ghost Mode, if
 * it is on). Archived chats are included only when the setting says so.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_READ_ALL } from './icons.std.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';

export default {
  id: 'read-all',
  icon: ICON_READ_ALL,
  name: 'Read All',
  version: '1.0.0',
  description: 'Mark every chat as read with /readall or Ctrl/⌘+Alt+R.',
  authors: ['Beacon'],
  tags: ['utility'],
  settings: [
    {
      key: 'includeArchived',
      type: 'toggle',
      label: 'Include archived chats',
      defaultValue: false,
    },
    {
      key: 'includeMuted',
      type: 'toggle',
      label: 'Include muted chats',
      defaultValue: true,
    },
  ],

  start(ctx) {
    let running = false;

    const readAll = async () => {
      if (running) {
        return;
      }
      running = true;
      try {
        const includeArchived = ctx.settings.get<boolean>('includeArchived');
        const includeMuted = ctx.settings.get<boolean>('includeMuted');
        const sendReadReceipts = itemStorage.get('read-receipt-setting', false);
        const now = Date.now();

        const targets = ctx.signal.conversationController
          .getAll()
          .filter(conversation => {
            const attrs = conversation.attributes;
            if (!attrs.unreadCount && !attrs.markedUnread) {
              return false;
            }
            if (attrs.isArchived && !includeArchived) {
              return false;
            }
            if (
              !includeMuted &&
              attrs.muteExpiresAt != null &&
              attrs.muteExpiresAt > now
            ) {
              return false;
            }
            return true;
          });

        if (targets.length === 0) {
          ctx.ui.showNotification('Nothing unread', 'info');
          return;
        }

        // Sequential: markRead does DB work and queues jobs per conversation.
        for (const conversation of targets) {
          // oxlint-disable-next-line no-await-in-loop
          await conversation.markRead(
            { received_at: Number.MAX_SAFE_INTEGER, sent_at: now },
            { readAt: now, sendReadReceipts }
          );
          if (conversation.attributes.markedUnread) {
            conversation.set({ markedUnread: false });
          }
        }
        ctx.ui.showNotification(
          `Marked ${targets.length} chat${targets.length === 1 ? '' : 's'} as read`,
          'success'
        );
      } catch (error) {
        ctx.error('read all failed', error);
        ctx.ui.showNotification('Read All failed — see console', 'error');
      } finally {
        running = false;
      }
    };

    ctx.commands.register({
      id: 'readall',
      name: 'Read all',
      description: 'Mark every chat as read',
      execute: () => readAll(),
    });
    ctx.keybinds.register('mod+alt+r', () => {
      void readAll();
    });
  },
} satisfies AddonManifest;
