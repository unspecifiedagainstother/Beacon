// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Purge Messages — "Purge Messages" in a conversation's ⋯ menu deletes every
 * message *you* sent there, for everyone, in one go.
 *
 * Signal only accepts delete-for-everyone within a time window (24 hours by
 * default, set by the server; longer for group admins on their own groups),
 * and recipients reject anything older. So a purge:
 *  1. scans the conversation for your own messages,
 *  2. deletes the eligible ones for everyone, one at a time, through the
 *     same path as the normal "Delete for everyone" action,
 *  3. optionally deletes the older ones *for you* (they stay on other
 *     people's devices — Signal cannot remove them).
 *
 * Nothing happens until you confirm a dialog showing both counts. Other
 * people's messages are never touched.
 */

import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import type { MessageAttributesType } from '../../model-types.d.ts';
import { ICON_PURGE_MESSAGES } from './icons.std.ts';
import { DataReader } from '../../sql/Client.preload.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { areWeAdmin } from '../../util/areWeAdmin.preload.ts';
import { canSendDeleteForEveryone } from '../../util/canDeleteForEveryone.preload.ts';
import { sendDeleteForEveryoneMessage } from '../../util/sendDeleteForEveryoneMessage.preload.ts';

const PAGE_SIZE = 500;

type ScanResult = {
  eligible: Array<MessageAttributesType>;
  tooOld: Array<MessageAttributesType>;
};

async function scanOwnMessages(conversationId: string): Promise<ScanResult> {
  const conversation = window.ConversationController.get(conversationId);
  if (!conversation) {
    throw new Error('conversation not found');
  }
  const ourAci = itemStorage.user.getCheckedAci();
  const isAdmin = areWeAdmin(conversation.attributes);

  const result: ScanResult = { eligible: [], tooOld: [] };
  let cursor:
    | { receivedAt: number; sentAt: number; messageId: string }
    | undefined;

  // Page backwards from the newest message. Each page comes back oldest
  // first, so the first element is the cursor for the next one.
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop
    const page = await DataReader.getOlderMessagesByConversation({
      conversationId,
      includeStoryReplies: false,
      limit: PAGE_SIZE,
      storyId: undefined,
      ...cursor,
    });
    if (page.length === 0) {
      break;
    }
    for (const message of page) {
      if (
        message.type !== 'outgoing' ||
        message.deletedForEveryone ||
        message.isErased
      ) {
        continue;
      }
      const check = canSendDeleteForEveryone({
        targetMessage: message,
        targetConversation: conversation.attributes,
        ourAci,
        isDeleterGroupAdmin: isAdmin,
      });
      (check.ok ? result.eligible : result.tooOld).push(message);
    }
    const oldest = page[0];
    if (!oldest || page.length < PAGE_SIZE) {
      break;
    }
    cursor = {
      receivedAt: oldest.received_at,
      sentAt: oldest.sent_at,
      messageId: oldest.id,
    };
  }

  return result;
}

function runPurge(ctx: AddonContext, conversationId: string): void {
  const el = (tag: string, className?: string, text?: string) =>
    ctx.ui.createElement({ tag, className, text });

  const conversation = window.ConversationController.get(conversationId);
  const title = conversation?.getTitle() ?? 'this chat';

  const body = el('div', 'BeaconPurge');
  body.append(el('p', 'BeaconPurge__text', 'Looking for your messages…'));

  const modal = ctx.ui.createModal({
    title: `Purge your messages in ${title}?`,
    content: body,
  });

  void (async () => {
    let scan: ScanResult;
    try {
      scan = await scanOwnMessages(conversationId);
    } catch (error) {
      ctx.error('purge scan failed', error);
      body.replaceChildren(
        el('p', 'BeaconPurge__text', 'Could not read this chat’s messages.')
      );
      return;
    }

    const { eligible, tooOld } = scan;
    if (eligible.length === 0 && tooOld.length === 0) {
      body.replaceChildren(
        el('p', 'BeaconPurge__text', 'You have no messages here to purge.')
      );
      return;
    }

    const summary = el('div', 'BeaconPurge__summary');
    const stat = (n: number, label: string, tone: string) => {
      const tile = el('div', `BeaconPurge__stat BeaconPurge__stat--${tone}`);
      tile.append(
        el('div', 'BeaconPurge__stat-value', String(n)),
        el('div', 'BeaconPurge__stat-label', label)
      );
      return tile;
    };
    summary.append(
      stat(eligible.length, 'deleted for everyone', 'danger'),
      stat(tooOld.length, 'too old to delete for everyone', 'muted')
    );

    const optionRow = el('label', 'BeaconPurge__option');
    const checkbox = ctx.ui.createElement({
      tag: 'input',
      attrs: { type: 'checkbox' },
    }) as HTMLInputElement;
    optionRow.append(
      checkbox,
      el(
        'span',
        undefined,
        `Also delete the ${tooOld.length} older message${tooOld.length === 1 ? '' : 's'} for me only (others keep their copy)`
      )
    );

    body.replaceChildren(
      summary,
      el(
        'p',
        'BeaconPurge__text',
        'This cannot be undone. Only messages you sent are affected; other people’s messages stay.'
      ),
      ...(tooOld.length ? [optionRow] : [])
    );

    let started = false;
    let stopped = false;

    modal.addAction({
      label: 'Cancel',
      onClick: () => {
        stopped = true;
        modal.close();
      },
    });
    modal.addAction({
      label:
        eligible.length > 0
          ? `Purge ${eligible.length} message${eligible.length === 1 ? '' : 's'}`
          : 'Delete older for me',
      variant: 'destructive',
      onClick: async () => {
        if (started) {
          return;
        }
        started = true;
        const deleteOldForMe = checkbox.checked;
        if (eligible.length === 0 && !deleteOldForMe) {
          modal.close();
          return;
        }

        const progress = el('div', 'BeaconPurge__progress');
        const bar = el('div', 'BeaconPurge__bar');
        const fill = el('div', 'BeaconPurge__bar-fill');
        bar.append(fill);
        const status = el('p', 'BeaconPurge__text');
        progress.append(bar, status);
        body.replaceChildren(progress);

        const delayMs = ctx.settings.get<number>('delayMs');
        let done = 0;
        let failed = 0;
        for (const message of eligible) {
          if (stopped) {
            break;
          }
          status.textContent = `Deleting ${done + 1} of ${eligible.length}…`;
          try {
            const current = window.ConversationController.get(conversationId);
            if (!current) {
              throw new Error('conversation gone');
            }
            // oxlint-disable-next-line no-await-in-loop
            await sendDeleteForEveryoneMessage(current.attributes, {
              id: message.id,
              timestamp: message.sent_at,
            });
          } catch (error) {
            failed += 1;
            ctx.warn('purge: delete failed', message.id, error);
          }
          done += 1;
          fill.style.width = `${Math.round((done / eligible.length) * 100)}%`;
          // Spread the sends out so the job queue and server rate limits
          // keep up.
          // oxlint-disable-next-line no-await-in-loop
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        if (deleteOldForMe && tooOld.length && !stopped) {
          status.textContent = 'Deleting older messages for you…';
          window.reduxActions.conversations.deleteMessages({
            conversationId,
            messageIds: tooOld.map(m => m.id),
          });
        }

        const parts = [
          `Deleted ${done - failed} for everyone`,
          failed ? `${failed} failed` : '',
          deleteOldForMe && tooOld.length && !stopped
            ? `${tooOld.length} deleted for you`
            : '',
          stopped ? 'stopped early' : '',
        ].filter(Boolean);
        status.textContent = `${parts.join(' · ')}.`;
        fill.style.width = '100%';
        ctx.ui.showNotification(
          parts.join(' · '),
          failed ? 'warning' : 'success'
        );
      },
    });
  })();
}

export default {
  id: 'purge-messages',
  icon: ICON_PURGE_MESSAGES,
  name: 'Purge Messages',
  version: '1.0.0',
  description:
    'Adds “Purge Messages” to the chat menu: delete all your own messages there for everyone at once.',
  authors: ['Beacon'],
  tags: ['privacy', 'chat'],
  settings: [
    {
      key: 'delayMs',
      type: 'number',
      label: 'Delay between deletes (ms)',
      description: 'Higher is gentler on rate limits for big purges.',
      defaultValue: 400,
      min: 100,
      max: 5000,
    },
  ],

  start(ctx) {
    ctx.css.inject(`
.BeaconPurge { display: flex; flex-direction: column; gap: 14px; white-space: normal; }
.BeaconPurge__text { margin: 0; font-size: 0.875rem; color: var(--axo-color-label-secondary); }
.BeaconPurge__summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.BeaconPurge__stat { padding: 12px; border-radius: 12px; background: var(--axo-color-fill-secondary); }
.BeaconPurge__stat-value { font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.BeaconPurge__stat--danger .BeaconPurge__stat-value { color: var(--axo-color-label-destructive); }
.BeaconPurge__stat-label { font-size: 0.75rem; color: var(--axo-color-label-secondary); }
.BeaconPurge__option { display: flex; gap: 10px; align-items: flex-start; font-size: 0.8125rem; cursor: pointer; }
.BeaconPurge__option input { margin-top: 2px; accent-color: var(--beacon-accent); }
.BeaconPurge__bar { height: 6px; border-radius: 3px; overflow: hidden; background: var(--axo-color-fill-secondary); }
.BeaconPurge__bar-fill { width: 0; height: 100%; background: var(--axo-color-label-destructive); transition: width 200ms ease-out; }
`);

    ctx.filters.add('conversation.menuItems', (items, { conversationId }) => [
      ...items,
      {
        id: 'beacon-purge-messages',
        label: 'Purge Messages',
        symbol: 'trash',
        onSelect: () => runPurge(ctx, conversationId),
      },
    ]);

    ctx.commands.register({
      id: 'purge',
      name: 'Purge my messages',
      description: 'Delete all your messages in this chat for everyone',
      execute: cmd => {
        if (!cmd.conversationId) {
          cmd.reply('Open a chat first', 'warning');
          return;
        }
        runPurge(ctx, cmd.conversationId);
      },
    });
  },
} satisfies AddonManifest;
