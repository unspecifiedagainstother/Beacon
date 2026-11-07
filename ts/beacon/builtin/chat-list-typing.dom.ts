// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { beaconTweaks } from '../core/tweaks.std.ts';

export const ICON_CHAT_LIST_TYPING = defineIcon([
  'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  'M8.5 12h.01',
  'M12 12h.01',
  'M15.5 12h.01',
]);

function firstName(contactId: string): string {
  const contact = window.ConversationController.get(contactId);
  if (!contact) {
    return 'Someone';
  }
  return (
    contact.get('systemGivenName') ||
    contact.get('profileName') ||
    contact.getTitle().split(' ')[0] ||
    'Someone'
  );
}

export default {
  id: 'chat-list-typing',
  builtin: true,
  icon: ICON_CHAT_LIST_TYPING,
  name: 'Typing in chat list',
  version: '1.0.0',
  description: 'Show who is typing in the chat list, not just the dots.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'directLabel',
      type: 'toggle',
      symbol: 'person',
      label: 'Say “typing” in one-to-one chats too',
      defaultValue: true,
    },
  ],

  start(ctx) {
    beaconTweaks.typingLabel = (contactIds, conversationType) => {
      if (contactIds.length === 0) {
        return undefined;
      }
      if (conversationType !== 'group') {
        return ctx.settings.get<boolean>('directLabel') ? 'typing' : undefined;
      }
      const names = contactIds.map(firstName);
      if (names.length === 1) {
        return `${names[0]} is typing`;
      }
      if (names.length === 2) {
        return `${names[0]} and ${names[1]} are typing`;
      }
      return `${names[0]} and ${names.length - 1} others are typing`;
    };
    ctx.onDispose(() => {
      beaconTweaks.typingLabel = undefined;
    });
  },
} satisfies AddonManifest;
