// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import type { MessageAttributesType } from '../../model-types.d.ts';
import { ICON_PURGE_MESSAGES } from '../addons/icons.std.ts';
import { DataReader } from '../../sql/Client.preload.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { areWeAdmin } from '../../util/areWeAdmin.preload.ts';
import { canSendDeleteForEveryone } from '../../util/canDeleteForEveryone.preload.ts';
import { sendDeleteForEveryoneMessage } from '../../util/sendDeleteForEveryoneMessage.preload.ts';

const PAGE_SIZE = 1000;

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

        const concurrency = ctx.settings.get<number>('concurrency');
        const queued: Array<string> = [];
        let failedToQueue = 0;
        let next = 0;
        const worker = async () => {
          while (next < eligible.length && !stopped) {
            const message = eligible[next];
            next += 1;
            if (!message) {
              break;
            }
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
              queued.push(message.id);
            } catch (error) {
              failedToQueue += 1;
              ctx.warn('purge: could not queue delete', message.id, error);
            }
            const handled = queued.length + failedToQueue;
            status.textContent = `Queued ${handled} of ${eligible.length}…`;
            fill.style.width = `${Math.round((handled / eligible.length) * 50)}%`;
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(concurrency, eligible.length) }, () =>
            worker()
          )
        );

        if (deleteOldForMe && tooOld.length && !stopped) {
          window.reduxActions.conversations.deleteMessages({
            conversationId,
            messageIds: tooOld.map(m => m.id),
          });
        }

        type SendState = 'sent' | 'failed' | 'pending';
        const stateOf = (
          attrs: Pick<
            MessageAttributesType,
            'deletedForEveryoneFailed' | 'deletedForEveryoneSendStatus'
          >
        ): SendState => {
          if (attrs.deletedForEveryoneFailed) {
            return 'failed';
          }
          const sendStatus = attrs.deletedForEveryoneSendStatus;
          return !sendStatus || Object.values(sendStatus).every(Boolean)
            ? 'sent'
            : 'pending';
        };
        const settle = async (): Promise<Array<SendState>> => {
          const states = new Map<string, SendState>();
          const missing: Array<string> = [];
          for (const id of queued) {
            const attrs = window.MessageCache.getById(id)?.attributes;
            if (attrs) {
              states.set(id, stateOf(attrs));
            } else {
              missing.push(id);
            }
          }
          if (missing.length) {
            const found = await DataReader.getMessagesById(missing);
            for (const attrs of found) {
              states.set(attrs.id, stateOf(attrs));
            }
          }
          return queued.map(id => states.get(id) ?? 'sent');
        };

        let sent = 0;
        let sendFailed = 0;
        const deadline = Date.now() + 30 * 60_000;
        for (;;) {
          sent = 0;
          sendFailed = 0;
          // oxlint-disable-next-line no-await-in-loop
          for (const state of await settle()) {
            if (state === 'sent') {
              sent += 1;
            } else if (state === 'failed') {
              sendFailed += 1;
            }
          }
          const settled = sent + sendFailed;
          status.textContent = `Sent ${settled} of ${queued.length}…`;
          fill.style.width = `${50 + Math.round((settled / Math.max(1, queued.length)) * 50)}%`;
          if (settled >= queued.length || Date.now() > deadline) {
            break;
          }
          // oxlint-disable-next-line no-await-in-loop
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        const failed = failedToQueue + sendFailed;
        const pending = queued.length - sent - sendFailed;
        const parts = [
          `${sent} deleted for everyone`,
          failed ? `${failed} failed` : '',
          pending ? `${pending} still sending` : '',
          deleteOldForMe && tooOld.length && !stopped
            ? `${tooOld.length} deleted for you`
            : '',
          stopped ? 'stopped early' : '',
        ].filter(Boolean);
        status.textContent = `Completed · ${parts.join(' · ')}.`;
        fill.style.width = '100%';
        ctx.ui.showNotification(
          `Purge completed · ${parts.join(' · ')}`,
          failed || pending ? 'warning' : 'success'
        );
      },
    });
  })();
}

export default {
  id: 'purge-messages',
  builtin: true,
  icon: ICON_PURGE_MESSAGES,
  name: 'Purge Messages',
  version: '1.0.0',
  description:
    'Adds “Purge Messages” to the chat menu: delete all your own messages there for everyone at once.',
  authors: ['Beacon'],
  tags: ['privacy', 'chat'],
  settings: [
    {
      key: 'concurrency',
      type: 'number',
      label: 'Parallel deletes',
      description:
        'How many deletes are queued at once. Sending is still paced by Signal’s own queue, which retries on rate limits.',
      defaultValue: 16,
      min: 1,
      max: 64,
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
