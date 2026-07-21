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
    const append = (entry: LogEntry) => {
      const log = ctx.storage.get<Array<LogEntry>>('log') ?? [];
      log.push(entry);
      if (log.length > MAX_LOG_ENTRIES) {
        log.splice(0, log.length - MAX_LOG_ENTRIES);
      }
      ctx.storage.set('log', log);
    };

    const deletedIds = new Set<string>();

    ctx.hooks.on('onMessageReceived', (message, info) => {
      append({
        direction: 'received',
        id: message.id,
        conversationId: info.conversationId,
        timestamp: message.timestamp,
        body: message.body,
      });
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

    ctx.hooks.on('onMessageDeleted', info => {
      deletedIds.add(info.id);
      append({
        direction: 'received',
        id: info.id,
        conversationId: info.conversationId,
        timestamp: Date.now(),
        body: '[deleted]',
      });
    });

    ctx.messages.intercept(msg => {
      const isDeleted = (msg as unknown as { isDeleted?: boolean }).isDeleted;
      if (isDeleted && msg.id) {
        deletedIds.add(msg.id);
      }
      return msg;
    });

    const observer = new MutationObserver(() => {
      document.querySelectorAll('[data-message-id]').forEach(el => {
        const msgId = el.getAttribute('data-message-id');
        if (msgId && deletedIds.has(msgId)) {
          el.classList.add('beacon-deleted-message');
        }
      });
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
        content: '✕ ';
        position: absolute;
        left: -26px;
        font-size: 14px;
        opacity: 0.7;
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
