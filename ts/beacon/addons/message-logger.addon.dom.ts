// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';

type LogEntry = {
  direction: 'sent' | 'received';
  id: string | undefined;
  conversationId: string;
  timestamp: number;
  body: string | undefined;
};

const MAX_LOG_ENTRIES = 5000;

/**
 * Message Logger — session log via hooks, /exportlog /clearlog /logstats.
 * Deleted messages show as icon + reduced opacity.
 */
export default {
  id: 'message-logger',
  name: 'Message Logger',
  version: '2.0.0',
  description: 'Log messages to JSON, /exportlog /clearlog /logstats',
  start(ctx) {
    ctx.log('message logger addon started');

    ctx.actions.intercept('MESSAGE_DELETED', action => {
      ctx.log('intercepting MESSAGE_DELETED:', action.payload);
      const { id, conversationId } = action.payload as {
        id: string;
        conversationId: string;
      };

      // Cancel removal. Instead, mark message as deleted in Redux + database.
      const state = ctx.redux.getState();
      const msg = state.conversations.messagesLookup[id];
      if (msg) {
        const markedDeleted = { ...msg, isDeleted: true };

        // Persist to database
        try {
          ctx.signal.messageCache.saveMessage(markedDeleted);
          ctx.log('saved deleted message to database:', id);
        } catch (err) {
          ctx.error('failed to save message:', err);
        }

        // Update Redux store
        ctx.redux.dispatch({
          type: 'MESSAGE_CHANGED',
          payload: { id, conversationId, data: markedDeleted },
        } as any);
        deletedIds.add(id);
        saveDeletedIds();
        ctx.log('marked message deleted:', id);
      }

      // Return null to cancel MESSAGE_DELETED action
      return null;
    });

    const append = (entry: LogEntry) => {
      const log = ctx.storage.get<Array<LogEntry>>('log') ?? [];
      log.push(entry);
      if (log.length > MAX_LOG_ENTRIES) {
        log.splice(0, log.length - MAX_LOG_ENTRIES);
      }
      ctx.storage.set('log', log);
    };

    const deletedIds = new Set<string>(
      ctx.storage.get<Array<string>>('deleted-ids') ?? []
    );

    const deletedContent = new Map<string, string>();

    const saveDeletedIds = () => {
      ctx.storage.set('deleted-ids', Array.from(deletedIds));
    };

    ctx.hooks.on('onMessageReceived', (message, info) => {
      append({
        direction: 'received',
        id: message.id,
        conversationId: info.conversationId,
        timestamp: message.timestamp,
        body: message.body,
      });

      // Track deleted messages loaded from database on app start
      if ((message as unknown as { isDeleted?: boolean }).isDeleted && message.id) {
        deletedIds.add(message.id);
        ctx.log('tracked deleted message from database:', message.id);
      }
    });

    ctx.hooks.on('onMessageSent', (message, info) => {
      append({
        direction: 'sent',
        id: message.id,
        conversationId: info.conversationId,
        timestamp: message.timestamp,
        body: message.body,
      });
    });


    ctx.messages.intercept(msg => {
      const isDeleted = (msg as unknown as { isDeleted?: boolean }).isDeleted;
      if (isDeleted && msg.id) {
        deletedIds.add(msg.id);
        if (!deletedContent.has(msg.id)) {
          deletedContent.set(msg.id, msg.body ?? '[no content]');
          ctx.log('captured deleted message content:', msg.id, msg.body);
        }
      }
      return msg;
    });

    // When message renders with deleted flag, mark its DOM element or create placeholder
    const markDeletedElement = (msgId: string) => {
      // Try multiple selectors to find the message element
      const selectors = [
        `[data-message-id="${msgId}"]`,
        `.module-message__container-outer[id*="${msgId}"]`,
        `[id*="${msgId}"].module-message__container-outer`,
        `.module-message[data-id="${msgId}"]`,
      ];

      let el: Element | null = null;
      for (const selector of selectors) {
        el = document.querySelector(selector);
        if (el) break;
      }

      if (el) {
        ctx.log('marking deleted DOM element:', msgId);
        el.classList.add('beacon-deleted-message');
      } else {
        // Fallback: search by text content or other attributes
        const allMessages = document.querySelectorAll('.module-message__container-outer, [role="article"]');
        for (const msg of allMessages) {
          if (msg.textContent?.includes(msgId) || msg.id?.includes(msgId)) {
            ctx.log('found deleted message by fallback:', msgId);
            msg.classList.add('beacon-deleted-message');
            break;
          }
        }
      }
    };

    ctx.hooks.on('onMessageChanged', msg => {
      if ((msg as unknown as { isDeleted?: boolean }).isDeleted) {
        markDeletedElement(msg.id);
      }
    });

    // When conversation is selected, mark all deleted messages in that conversation
    ctx.hooks.on('onConversationSelected', conversationId => {
      if (conversationId) {
        ctx.log('conversation selected, re-checking deleted messages:', conversationId);
        setTimeout(() => {
          for (const msgId of deletedIds) {
            markDeletedElement(msgId);
          }
        }, 100);
      }
    });

    const observer = new MutationObserver(() => {
      // Reapply deleted marker to all tracked deleted messages
      for (const msgId of deletedIds) {
        const selectors = [
          `[data-message-id="${msgId}"]`,
          `.module-message__container-outer[id*="${msgId}"]`,
          `[id*="${msgId}"].module-message__container-outer`,
          `.module-message[data-id="${msgId}"]`,
        ];

        for (const selector of selectors) {
          const msgEls = document.querySelectorAll(selector);
          msgEls.forEach(el => {
            if (!el.classList.contains('beacon-deleted-message')) {
              el.classList.add('beacon-deleted-message');
              ctx.log('marked deleted via observer:', msgId);
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    ctx.onDispose(() => observer.disconnect());

    ctx.css.inject(`
      .beacon-deleted-message {
        opacity: 0.5 !important;
        position: relative;
      }
      /* Trash icon on message container */
      .beacon-deleted-message::before {
        content: '🗑';
        position: absolute;
        left: 4px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 16px;
        z-index: 10;
        opacity: 0.8;
      }
      /* Alternative: on module-message */
      .beacon-deleted-message .module-message::after {
        content: '🗑';
        display: inline;
        margin-left: 4px;
        font-size: 14px;
        opacity: 0.8;
      }
      .beacon-deleted-placeholder {
        margin: 4px 0;
        border-left: 2px solid #999;
        background: rgba(0,0,0,0.1);
      }
    `);

    ctx.commands.register({
      id: 'exportlog',
      name: 'Export message log',
      description: 'Download JSON',
      execute: cmd => {
        const log = ctx.storage.get<Array<LogEntry>>('log') ?? [];
        const blob = new Blob([JSON.stringify(log, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `beacon-log-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        cmd.reply(`Exported ${log.length} messages`);
      },
    });

    ctx.commands.register({
      id: 'clearlog',
      name: 'Clear message log',
      description: 'Delete all logged messages',
      execute: cmd => {
        ctx.storage.delete('log');
        cmd.reply('Cleared');
      },
    });

    ctx.commands.register({
      id: 'logstats',
      name: 'Log stats',
      description: 'Show logged message count',
      execute: cmd => {
        const log = ctx.storage.get<Array<LogEntry>>('log') ?? [];
        const sent = log.filter(m => m.direction === 'sent').length;
        const received = log.filter(m => m.direction === 'received').length;
        cmd.insertText(
          `Logged: ${sent} sent, ${received} received, ${log.length} total`
        );
      },
    });

    ctx.log('message logger running');
  },
} satisfies AddonManifest;

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}
