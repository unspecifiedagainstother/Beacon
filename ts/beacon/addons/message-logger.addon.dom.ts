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
      setTimeout(() => {
        const selector = `[aria-labelledby*="${msgId}"]`;
        const el = document.querySelector(selector);
        if (el) {
          ctx.log('marking deleted DOM element:', msgId);
          el.classList.add('beacon-deleted-message');
        } else {
          ctx.log('element already gone, creating placeholder:', msgId);
          const content = deletedContent.get(msgId) || '[deleted message]';
          const placeholder = document.createElement('div');
          placeholder.className = 'beacon-deleted-message beacon-deleted-placeholder';
          placeholder.innerHTML = `<div style="padding: 8px; opacity: 0.55; display: flex; align-items: flex-start; gap: 8px;"><span style="flex-shrink: 0;">🗑</span><span style="font-size: 12px; color: #999; flex: 1; word-break: break-word;">${escapeHtml(content)}</span></div>`;

          // Find message container and insert placeholder
          const messageContainer = document.querySelector('[role="listbox"], [role="list"], .module-conversation__messages');
          if (messageContainer) {
            messageContainer.appendChild(placeholder);
          }
        }
      }, 0);
    };

    ctx.hooks.on('onMessageChanged', msg => {
      if ((msg as unknown as { isDeleted?: boolean }).isDeleted) {
        markDeletedElement(msg.id);
      }
    });

    const observer = new MutationObserver(() => {
      for (const msgId of deletedIds) {
        const selector = `[aria-labelledby*="${msgId}"]`;
        const msgEls = document.querySelectorAll(selector);
        if (msgEls.length > 0) {
          ctx.log('found deleted message element:', msgId);
          msgEls.forEach(el => {
            el.classList.add('beacon-deleted-message');
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
        opacity: 0.55 !important;
      }
      .beacon-deleted-message .module-message {
        position: relative;
        display: flex;
        align-items: center;
      }
      .beacon-deleted-message .module-message::before {
        content: '🗑 ';
        position: absolute;
        left: -30px;
        font-size: 16px;
        opacity: 0.6;
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
