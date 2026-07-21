// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';

/**
 * Stats Dashboard — /stats shows session counters.
 */
export default {
  id: 'stats-dashboard',
  name: 'Stats Dashboard',
  version: '2.0.0',
  description: 'Session stats: /stats shows message counts and uptime',
  start(ctx) {
    const startedAt = Date.now();
    let received = 0;
    let sent = 0;

    ctx.hooks.on('onMessageReceived', () => {
      received += 1;
    });
    ctx.hooks.on('onMessageSent', () => {
      sent += 1;
    });

    ctx.commands.register({
      id: 'stats',
      name: 'Session stats',
      description: 'Show message counts and uptime',
      execute: cmd => {
        const minutes = Math.floor((Date.now() - startedAt) / 60000);
        const total = received + sent;
        const rate = minutes > 0 ? (total / minutes).toFixed(1) : String(total);
        cmd.insertText(
          [
            'Session stats:',
            `received: ${received}`,
            `sent: ${sent}`,
            `uptime: ${minutes} min`,
            `rate: ${rate} msg/min`,
          ].join('\n')
        );
      },
    });

    ctx.log('stats running');
  },
} satisfies AddonManifest;
