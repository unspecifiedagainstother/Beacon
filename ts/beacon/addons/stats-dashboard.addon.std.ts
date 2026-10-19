// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_STATS_DASHBOARD } from './icons.std.ts';

/**
 * Stats Dashboard — session counters, shown with /stats.
 */
export default {
  id: 'stats-dashboard',
  icon: ICON_STATS_DASHBOARD,
  name: 'Stats Dashboard',
  version: '3.0.0',
  description: 'Session counters: messages, edits, deletes, busiest chats.',
  authors: ['Beacon'],
  tags: ['utility'],
  start(ctx) {
    const startedAt = Date.now();
    const counts = { received: 0, sent: 0, edited: 0, deleted: 0 };
    const perConversation = new Map<string, number>();

    ctx.hooks.on('onMessageReceived', (_message, { conversationId }) => {
      counts.received += 1;
      perConversation.set(
        conversationId,
        (perConversation.get(conversationId) ?? 0) + 1
      );
    });
    ctx.hooks.on('onMessageSent', () => {
      counts.sent += 1;
    });
    ctx.hooks.on('onMessageEdited', () => {
      counts.edited += 1;
    });
    ctx.hooks.on('onMessageDeletedForEveryone', () => {
      counts.deleted += 1;
    });

    const el = (tag: string, className: string, text?: string) =>
      ctx.ui.createElement({ tag, className, text });

    ctx.commands.register({
      id: 'stats',
      name: 'Session stats',
      description: 'Show message counts for this session',
      execute: () => {
        const minutes = Math.max(
          1,
          Math.floor((Date.now() - startedAt) / 60000)
        );
        const total = counts.received + counts.sent;

        const grid = el('div', 'BeaconStats');
        for (const [label, value] of [
          ['Received', counts.received],
          ['Sent', counts.sent],
          ['Edited', counts.edited],
          ['Deleted', counts.deleted],
          ['Per minute', (total / minutes).toFixed(1)],
          ['Uptime', `${minutes} min`],
        ] as const) {
          const tile = el('div', 'BeaconStats__tile');
          tile.append(
            el('div', 'BeaconStats__value', String(value)),
            el('div', 'BeaconStats__label', label)
          );
          grid.append(tile);
        }

        const top = Array.from(perConversation.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        const root = el('div', 'BeaconStatsRoot');
        root.append(grid);
        if (top.length) {
          const list = el('div', 'BeaconList');
          list.append(el('div', 'BeaconList__heading', 'Busiest chats'));
          for (const [conversationId, n] of top) {
            const row = el('div', 'BeaconList__row');
            row.append(
              el(
                'span',
                'BeaconList__title',
                ctx.signal.conversationController
                  .get(conversationId)
                  ?.getTitle() ?? 'Unknown'
              ),
              el('span', 'BeaconList__meta', `${n} received`)
            );
            list.append(row);
          }
          root.append(list);
        }

        ctx.ui.createModal({ title: 'Session stats', content: root });
      },
    });
  },
} satisfies AddonManifest;
