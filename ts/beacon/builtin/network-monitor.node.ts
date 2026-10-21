// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Network monitor: which hosts Beacon connects to. Records every Node
 * socket opened in the renderer (net/tls — attachments, link previews,
 * updates, ...); the main process adds Chromium's own requests. Shown in
 * Settings → Privacy. Host and port only, kept in memory, never saved.
 *
 * libsignal opens the encrypted chat connection itself, in native code, so
 * that one is not listed (it goes to chat.signal.org).
 */

import net from 'node:net';

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_NETWORK_MONITOR } from '../addons/icons.std.ts';
import { recordConnection } from '../core/network-log.std.ts';
import { siteOf } from '../util/linkSafety.std.ts';

/** Sites Signal itself talks to; anything else is "new" for alerts. */
export const SIGNAL_SITES = new Set([
  'signal.org',
  'signal.art',
  'signal.group',
  'signal.me',
  'signal.link',
  'signal.tube',
  'signalusers.org',
  'giphy.com', // GIF search goes through Signal's proxy, previews may not
]);

function parseTarget(
  args: Array<unknown>
): { host: string; port?: number } | undefined {
  const [first, second] = args;
  if (Array.isArray(first)) {
    // Internal normalized form: [options, callback]
    return parseTarget(first);
  }
  if (typeof first === 'object' && first != null) {
    const options = first as { host?: unknown; port?: unknown; path?: unknown };
    if (typeof options.path === 'string') {
      return undefined; // local IPC socket
    }
    const host = typeof options.host === 'string' ? options.host : 'localhost';
    const port = Number(options.port);
    return { host, port: Number.isFinite(port) ? port : undefined };
  }
  if (
    typeof first === 'number' ||
    (typeof first === 'string' && /^\d+$/.test(first))
  ) {
    return {
      host: typeof second === 'string' ? second : 'localhost',
      port: Number(first),
    };
  }
  return undefined;
}

export default {
  id: 'network-monitor',
  builtin: true,
  category: 'privacy',
  icon: ICON_NETWORK_MONITOR,
  name: 'Network monitor',
  version: '1.0.0',
  description:
    'List the servers Beacon connects to, at the bottom of this page. Kept in memory only, never saved.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'enabled',
      type: 'toggle',
      symbol: 'wifi',
      label: 'Record connections',
      defaultValue: true,
    },
    {
      key: 'alertNew',
      type: 'toggle',
      symbol: 'bell',
      label: 'Notify on connections outside Signal’s servers',
      description: 'Shown once per site per session.',
      defaultValue: false,
    },
  ],

  start(ctx) {
    const alerted = new Set<string>();

    ctx.patcher.before(net.Socket.prototype, 'connect', args => {
      if (!ctx.settings.get<boolean>('enabled')) {
        return undefined;
      }
      const target = parseTarget(args);
      if (
        !target ||
        target.host === 'localhost' ||
        target.host === '127.0.0.1'
      ) {
        return undefined;
      }
      recordConnection(target.host, target.port, 'socket');

      if (ctx.settings.get<boolean>('alertNew')) {
        const site = siteOf(target.host);
        const isIp = /^[\d.:]+$/.test(target.host);
        if (!isIp && !SIGNAL_SITES.has(site) && !alerted.has(site)) {
          alerted.add(site);
          ctx.ui.showNotification(`Connecting to ${target.host}`, 'warning');
        }
      }
      return undefined;
    });
  },
} satisfies AddonManifest;
