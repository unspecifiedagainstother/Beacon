// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_UNVERIFIED_GUARD } from '../addons/icons.std.ts';
import { askChoice } from '../core/prompts.dom.ts';
import { createElement } from '../core/ui.dom.ts';
import { isMe } from '../../util/whatTypeOfConversation.dom.ts';

const CALL_SOURCES = new Set(['InitiateCall', 'JoinCall']);

function unverifiedContact(serviceId: string) {
  const contact = window.ConversationController.get(serviceId);
  if (!contact || isMe(contact.attributes) || contact.isVerified()) {
    return undefined;
  }
  return contact;
}

export default {
  id: 'unverified-guard',
  builtin: true,
  category: 'privacy',
  icon: ICON_UNVERIFIED_GUARD,
  name: 'Unverified contacts',
  version: '1.0.0',
  description:
    'Ask before messaging or calling someone whose safety number you haven’t verified.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'mode',
      type: 'select',
      symbol: 'person-key',
      label: 'Ask before sending to unverified contacts',
      options: [
        { value: 'once', label: 'Once per contact' },
        { value: 'session', label: 'Once per contact until restart' },
        { value: 'always', label: 'Every time' },
        { value: 'off', label: 'Never' },
      ],
      defaultValue: 'once',
    },
    {
      key: 'groups',
      type: 'toggle',
      symbol: 'group',
      label: 'Also in groups',
      description: 'Asks when any member is unverified — noisy in big groups.',
      defaultValue: false,
    },
    {
      key: 'calls',
      type: 'toggle',
      symbol: 'phone',
      label: 'Also before calls',
      defaultValue: true,
    },
    {
      key: 'badge',
      type: 'toggle',
      symbol: 'shield',
      label: 'Show “Not verified” in the chat header',
      defaultValue: true,
    },
  ],

  start(ctx) {
    const approved = new Set<string>();
    const remembered = new Set(
      ctx.storage.get<Array<string>>('approved') ?? []
    );
    const isApproved = (id: string, mode: string) =>
      mode === 'once' ? remembered.has(id) : approved.has(id);

    ctx.filters.addAsync('send.verify', async (allowed, info) => {
      const mode = ctx.settings.get<string>('mode');
      if (!allowed || mode === 'off') {
        return allowed;
      }
      if (
        CALL_SOURCES.has(info.source) &&
        !ctx.settings.get<boolean>('calls')
      ) {
        return allowed;
      }
      const inGroup = info.conversationIds.some(
        id => window.ConversationController.get(id)?.get('type') === 'group'
      );
      if (inGroup && !ctx.settings.get<boolean>('groups')) {
        return allowed;
      }

      const contacts = info.serviceIds
        .map(unverifiedContact)
        .filter(c => c != null)
        .filter(c => mode === 'always' || !isApproved(c.id, mode));
      if (contacts.length === 0) {
        return allowed;
      }

      const names = contacts.slice(0, 5).map(c => c.getTitle());
      const more =
        contacts.length > 5 ? ` and ${contacts.length - 5} more` : '';
      const choice = await askChoice({
        title: 'Not verified',
        intro: `You haven’t verified the safety number with ${names.join(', ')}${more}. Compare it in person or on a call you trust to be sure nobody is in between.`,
        choices: [
          {
            value: 'verify',
            label: 'Verify safety number',
            description: 'Opens the safety number; nothing is sent.',
          },
          {
            value: 'send',
            label: CALL_SOURCES.has(info.source)
              ? 'Call anyway'
              : 'Send anyway',
          },
          { value: 'cancel', label: 'Cancel' },
        ],
      });
      if (choice === 'send') {
        for (const c of contacts) {
          approved.add(c.id);
          remembered.add(c.id);
        }
        if (mode === 'once') {
          ctx.storage.set('approved', [...remembered]);
        }
        return true;
      }
      if (choice === 'verify' && contacts[0]) {
        window.reduxActions.globalModals.toggleSafetyNumberModal(
          contacts[0].id
        );
      }
      return false;
    });

    ctx.ui.slot(
      'conversation.header.beforeCall',
      (container, { conversationId }) => {
        if (!ctx.settings.get<boolean>('badge')) {
          return;
        }
        const conversation = window.ConversationController.get(conversationId);
        if (
          !conversation ||
          conversation.get('type') !== 'private' ||
          isMe(conversation.attributes) ||
          conversation.isVerified()
        ) {
          return;
        }
        const badge = createElement({
          tag: 'button',
          className: 'BeaconUnverifiedBadge',
          text: 'Not verified',
          attrs: { type: 'button', title: 'View safety number' },
          onClick: () =>
            window.reduxActions.globalModals.toggleSafetyNumberModal(
              conversationId
            ),
        });
        container.appendChild(badge);
        return () => badge.remove();
      }
    );
  },
} satisfies AddonManifest;
