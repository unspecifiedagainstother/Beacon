// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Bookmarks and saved messages, from a message's right-click menu.
 *
 *  - Bookmark: remembers the message (with an optional note and a snapshot
 *    of its text) in Signal's encrypted database. Mod+Alt+K or /bookmarks
 *    lists them, searchable, with Jump.
 *  - Save to Note to Self: sends a copy (text and downloaded attachments)
 *    to your Note to Self chat in one click.
 */

import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { askText } from '../core/prompts.dom.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { getMessageById } from '../../messages/getMessageById.preload.ts';
import { maybeForwardMessages } from '../../util/maybeForwardMessages.preload.ts';
import { getMessagePropsSelector } from '../../state/selectors/message.preload.ts';
import { getConversationSelector } from '../../state/selectors/conversations.dom.ts';
import { hydrateRanges } from '../../util/BodyRange.node.ts';
import { isDownloaded } from '../../util/Attachment.std.ts';
import { drop } from '../../util/drop.std.ts';
import type { BeaconBookmark } from '../features.std.ts';

export const ICON_BOOKMARKS = defineIcon(['M6 3h12v18l-6-4-6 4z']);

const STORAGE_KEY = 'beaconBookmarks';
const SNAPSHOT_LENGTH = 280;

function titleOf(conversationId: string): string {
  return (
    window.ConversationController.get(conversationId)?.getTitle() ?? 'Unknown'
  );
}

async function saveToNoteToSelf(
  ctx: AddonContext,
  messageId: string
): Promise<void> {
  const ourId = window.ConversationController.getOurConversationId();
  const message = await getMessageById(messageId);
  if (!ourId || !message) {
    ctx.ui.showNotification('Couldn’t find that message', 'error');
    return;
  }
  const state = ctx.redux.getState();
  const props = getMessagePropsSelector(state)(message.attributes);
  const attachments = (props.attachments ?? []).filter(isDownloaded);
  const skipped = (props.attachments?.length ?? 0) - attachments.length;
  if (!props.text && attachments.length === 0) {
    ctx.ui.showNotification(
      'Nothing to save — download the media first',
      'warning'
    );
    return;
  }
  const ok = await maybeForwardMessages(
    [
      {
        originalMessage: message.attributes,
        draft: {
          attachments,
          bodyRanges: hydrateRanges(
            props.bodyRanges,
            getConversationSelector(state)
          ),
          hasContact: Boolean(props.contact),
          isSticker: Boolean(props.isSticker),
          messageBody: props.text,
          originalMessageId: props.id,
          previews: props.previews ?? [],
        },
      },
    ],
    [ourId]
  );
  if (!ok) {
    ctx.ui.showNotification('Couldn’t save to Note to Self', 'error');
  } else if (skipped > 0) {
    ctx.ui.showNotification(
      `Saved to Note to Self (${skipped} attachment(s) not downloaded were left out)`,
      'warning'
    );
  } else {
    ctx.ui.showNotification('Saved to Note to Self', 'success');
  }
}

export default {
  id: 'bookmarks',
  builtin: true,
  icon: ICON_BOOKMARKS,
  name: 'Bookmarks & saved messages',
  version: '1.0.0',
  description:
    'Right-click a message to bookmark it or save a copy to Note to Self. Mod+Alt+K or /bookmarks lists bookmarks.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'snapshot',
      type: 'toggle',
      symbol: 'note',
      label: 'Keep a snapshot of the text',
      description:
        'So a bookmark stays readable if the message disappears or is deleted.',
      defaultValue: true,
    },
  ],

  start(ctx) {
    const list = (): Array<BeaconBookmark> => [
      ...(itemStorage.get(STORAGE_KEY) ?? []),
    ];
    const save = (next: Array<BeaconBookmark>) =>
      itemStorage.put(STORAGE_KEY, next);

    const toggleBookmark = async (
      messageId: string,
      conversationId: string
    ) => {
      const all = list();
      const existing = all.findIndex(b => b.messageId === messageId);
      if (existing >= 0) {
        all.splice(existing, 1);
        await save(all);
        ctx.ui.showNotification('Bookmark removed');
        return;
      }
      const message = await getMessageById(messageId);
      const text = message?.get('body') ?? '';
      all.unshift({
        messageId,
        conversationId,
        sentAt: message?.get('sent_at') ?? Date.now(),
        addedAt: Date.now(),
        snapshot: ctx.settings.get<boolean>('snapshot')
          ? text.slice(0, SNAPSHOT_LENGTH)
          : undefined,
      });
      await save(all);
      ctx.ui.showNotification(
        'Bookmarked — Mod+Alt+K to see bookmarks',
        'success'
      );
    };

    const editNote = async (messageId: string) => {
      const note = await askText({
        title: 'Bookmark note',
        placeholder: 'Note',
        initial: list().find(b => b.messageId === messageId)?.note,
        submitLabel: 'Save',
      });
      if (note == null) {
        return;
      }
      const all = list().map(b =>
        b.messageId === messageId ? { ...b, note: note || undefined } : b
      );
      await save(all);
    };

    ctx.filters.add(
      'message.menuItems',
      (items, { messageId, conversationId }) => {
        const isBookmarked = list().some(b => b.messageId === messageId);
        return [
          ...items,
          {
            id: 'beacon-bookmark',
            label: isBookmarked ? 'Remove bookmark' : 'Bookmark',
            symbol: 'tag',
            onSelect: () => drop(toggleBookmark(messageId, conversationId)),
          },
          {
            id: 'beacon-save-self',
            label: 'Save to Note to Self',
            symbol: 'note',
            onSelect: () => drop(saveToNoteToSelf(ctx, messageId)),
          },
        ];
      }
    );

    const openViewer = () => {
      const root = ctx.ui.createElement({
        tag: 'div',
        className: 'BeaconBookmarks',
      });
      const search = ctx.ui.createElement({
        tag: 'input',
        className: 'BeaconInput BeaconBookmarks__search',
        attrs: {
          type: 'search',
          placeholder: 'Search bookmarks',
          spellcheck: 'false',
        },
      }) as HTMLInputElement;
      const rows = ctx.ui.createElement({
        tag: 'div',
        className: 'BeaconBookmarks__list',
      });
      root.append(search, rows);

      const modal = ctx.ui.createModal({
        title: 'Bookmarks',
        content: root,
        size: 'wide',
      });

      const render = () => {
        const query = search.value.trim().toLowerCase();
        const items = list().filter(b => {
          if (!query) {
            return true;
          }
          return [b.snapshot, b.note, titleOf(b.conversationId)]
            .filter(Boolean)
            .some(text => text?.toLowerCase().includes(query));
        });
        rows.replaceChildren();
        if (items.length === 0) {
          rows.append(
            ctx.ui.createElement({
              tag: 'p',
              className: 'BeaconBookmarks__empty',
              text: query
                ? 'No matches.'
                : 'No bookmarks yet. Right-click a message → Bookmark.',
            })
          );
          return;
        }
        for (const b of items) {
          const head = ctx.ui.createElement({
            tag: 'div',
            className: 'BeaconBookmarks__head',
            children: [
              ctx.ui.createElement({
                tag: 'strong',
                text: titleOf(b.conversationId),
              }),
              ctx.ui.createElement({
                tag: 'span',
                className: 'BeaconBookmarks__date',
                text: new Date(b.sentAt).toLocaleString(),
              }),
            ],
          });
          const actions = ctx.ui.createElement({
            tag: 'div',
            className: 'BeaconBookmarks__actions',
            children: [
              ctx.ui.createElement({
                tag: 'button',
                className: 'BeaconButton BeaconButton--ghost',
                text: b.note ? 'Edit note' : 'Add note',
                attrs: { type: 'button' },
                onClick: () =>
                  drop(
                    (async () => {
                      await editNote(b.messageId);
                      render();
                    })()
                  ),
              }),
              ctx.ui.createElement({
                tag: 'button',
                className: 'BeaconButton BeaconButton--ghost',
                text: 'Remove',
                attrs: { type: 'button' },
                onClick: () =>
                  drop(
                    (async () => {
                      await save(
                        list().filter(x => x.messageId !== b.messageId)
                      );
                      render();
                    })()
                  ),
              }),
              ctx.ui.createElement({
                tag: 'button',
                className: 'BeaconButton BeaconButton--primary',
                text: 'Jump',
                attrs: { type: 'button' },
                onClick: () => {
                  window.reduxActions.conversations.showConversation({
                    conversationId: b.conversationId,
                    messageId: b.messageId,
                  });
                  modal.close();
                },
              }),
            ],
          });
          const card = ctx.ui.createElement({
            tag: 'div',
            className: 'BeaconBookmarks__card',
            children: [
              head,
              ...(b.snapshot
                ? [
                    ctx.ui.createElement({
                      tag: 'p',
                      className: 'BeaconBookmarks__text',
                      text: b.snapshot,
                    }),
                  ]
                : []),
              ...(b.note
                ? [
                    ctx.ui.createElement({
                      tag: 'p',
                      className: 'BeaconBookmarks__note',
                      text: b.note,
                    }),
                  ]
                : []),
              actions,
            ],
          });
          rows.append(card);
        }
      };
      search.addEventListener('input', render);
      render();
      search.focus();
    };

    ctx.keybinds.register('mod+alt+K', openViewer);
    ctx.commands.register({
      id: 'bookmarks',
      name: 'Bookmarks',
      description: 'List bookmarked messages',
      execute: () => openViewer(),
    });
  },
} satisfies AddonManifest;
