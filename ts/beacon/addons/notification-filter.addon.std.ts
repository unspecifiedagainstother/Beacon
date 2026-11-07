// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Notification Filter — silence desktop notifications by keyword or sender,
 * or the opposite: only notify for messages that mention a keyword.
 *
 * Uses the 'notification.show' filter in NotificationService.add, so
 * messages still arrive and count as unread — only the popup is dropped.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_NOTIFICATION_FILTER } from './icons.std.ts';

function parseList(value: string): Array<string> {
  return value
    .split(/[\n,]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

export default {
  id: 'notification-filter',
  icon: ICON_NOTIFICATION_FILTER,
  name: 'Notification Filter',
  version: '1.0.0',
  description:
    'Mute notifications by keyword or sender, or only notify on keywords.',
  authors: ['Beacon'],
  tags: ['utility'],
  settings: [
    {
      key: 'mode',
      type: 'select',
      label: 'Mode',
      defaultValue: 'block',
      options: [
        { label: 'Hide notifications that match', value: 'block' },
        { label: 'Only show notifications that match', value: 'allow' },
      ],
    },
    {
      key: 'keywords',
      type: 'text',
      label: 'Keywords',
      description: 'One per line or comma-separated. Case-insensitive.',
      defaultValue: '',
      multiline: true,
    },
    {
      key: 'senders',
      type: 'text',
      label: 'Senders',
      description: 'Contact or group names, as shown in the chat list.',
      defaultValue: '',
      multiline: true,
    },
    {
      key: 'reactions',
      type: 'toggle',
      label: 'Hide reaction notifications',
      defaultValue: false,
    },
  ],

  start(ctx) {
    let blockedCount = 0;

    ctx.filters.add('notification.show', (show, info) => {
      // Never filter call notifications — missing a ringing call is worse
      // than any noise this addon is meant to cut.
      if (!show || (info.type !== 'Message' && info.type !== 'Reaction')) {
        return show;
      }

      if (ctx.settings.get<boolean>('reactions') && info.type === 'Reaction') {
        blockedCount += 1;
        return false;
      }

      const keywords = parseList(ctx.settings.get<string>('keywords'));
      const senders = parseList(ctx.settings.get<string>('senders'));
      if (keywords.length === 0 && senders.length === 0) {
        return show;
      }

      const text = info.message.toLowerCase();
      const sender = info.senderTitle.toLowerCase();
      const matches =
        keywords.some(k => text.includes(k)) ||
        senders.some(s => sender === s || sender.includes(s));

      const allow =
        ctx.settings.get<string>('mode') === 'allow' ? matches : !matches;
      if (!allow) {
        blockedCount += 1;
      }
      return allow;
    });

    ctx.commands.register({
      id: 'notifstats',
      name: 'Notification filter stats',
      description: 'How many notifications were hidden this session',
      execute: cmd =>
        cmd.reply(`Hidden ${blockedCount} notification(s) this session`),
    });
  },
} satisfies AddonManifest;
