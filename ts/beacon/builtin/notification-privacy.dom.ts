// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Per-chat notification privacy. Signal has one global choice (name and
 * message / name only / nothing); this lets a chat override it — e.g. show
 * everything for family but nothing for one sensitive chat — from the chat's
 * ⋯ menu. Overrides are applied after Signal's own setting, so they can only
 * reveal less than the global setting allows, never more.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_NOTIFICATION_PRIVACY } from '../addons/icons.std.ts';
import { askChoice } from '../core/prompts.dom.ts';

type Level = 'default' | 'name' | 'none' | 'silent';

const LEVELS: ReadonlyArray<{
  value: Level;
  label: string;
  description: string;
}> = [
  {
    value: 'default',
    label: 'Use the global setting',
    description: 'Settings → Notifications → Notification content.',
  },
  {
    value: 'name',
    label: 'Name only',
    description: 'Who wrote, but not what.',
  },
  {
    value: 'none',
    label: 'No name or content',
    description: '“New message”, without a photo.',
  },
  {
    value: 'silent',
    label: 'No notifications',
    description: 'Like muting, but the chat still shows as unread.',
  },
];

export default {
  id: 'notification-privacy',
  builtin: true,
  category: 'privacy',
  icon: ICON_NOTIFICATION_PRIVACY,
  name: 'Notifications',
  version: '1.0.0',
  description:
    'Choose per chat how much a notification reveals: from the chat’s ⋯ menu → Notification privacy.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'hideAvatars',
      type: 'toggle',
      symbol: 'person-circle',
      label: 'Never show profile photos in notifications',
      defaultValue: false,
    },
    {
      key: 'groupsDefault',
      type: 'select',
      symbol: 'group',
      label: 'Default for groups',
      options: LEVELS.map(({ value, label }) => ({ value, label })),
      defaultValue: 'default',
    },
  ],

  start(ctx) {
    const overrides = (): Record<string, Level> =>
      ctx.storage.get<Record<string, Level>>('overrides') ?? {};

    const levelFor = (conversationId: string): Level => {
      const own = overrides()[conversationId];
      if (own && own !== 'default') {
        return own;
      }
      const conversation = window.ConversationController.get(conversationId);
      if (conversation?.get('type') === 'group') {
        return ctx.settings.get<Level>('groupsDefault');
      }
      return 'default';
    };

    ctx.filters.add('notification.show', (show, info) =>
      show && levelFor(info.conversationId) === 'silent' ? false : show
    );

    ctx.filters.add('notification.content', (content, info) => {
      const level = levelFor(info.conversationId);
      let next = content;
      if (level === 'name') {
        next = { ...next, body: window.SignalContext.i18n('icu:newMessage') };
      } else if (level === 'none') {
        next = {
          title: window.SignalContext.i18n('icu:newMessage'),
          body: '',
          iconUrl: null,
          iconAbsolutePath: null,
        };
      }
      if (ctx.settings.get<boolean>('hideAvatars')) {
        next = { ...next, iconUrl: null, iconAbsolutePath: null };
      }
      return next;
    });

    ctx.filters.add('conversation.menuItems', (items, { conversationId }) => [
      ...items,
      {
        id: 'beacon-notification-privacy',
        label: 'Notification privacy',
        symbol: 'bell-slash',
        onSelect: async () => {
          const current = overrides()[conversationId] ?? 'default';
          const picked = await askChoice({
            title: 'Notification privacy',
            intro: 'For this chat only.',
            choices: LEVELS,
            current,
          });
          if (!picked) {
            return;
          }
          const next = { ...overrides() };
          if (picked === 'default') {
            delete next[conversationId];
          } else {
            next[conversationId] = picked;
          }
          ctx.storage.set('overrides', next);
          ctx.ui.showNotification('Notification privacy updated', 'success');
        },
      },
    ]);
  },
} satisfies AddonManifest;
