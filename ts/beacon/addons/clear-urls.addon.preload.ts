// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Clear URLs — strips tracking parameters (utm_*, fbclid, gclid, si, ...)
 * from links in messages you send.
 *
 * Patches ConversationModel.prototype.enqueueMessageForSend and rewrites the
 * body before it is saved or sent. Messages with formatting or mentions are
 * left alone: their body ranges are character offsets, and shortening a URL
 * in front of them would shift every range.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_CLEAR_URLS } from './icons.std.ts';
import { ConversationModel } from '../../models/conversations.preload.ts';
import {
  cleanUrlsInText,
  DEFAULT_TRACKING_PARAMS,
  toParamMatchers,
} from '../util/clearUrls.std.ts';

export default {
  id: 'clear-urls',
  icon: ICON_CLEAR_URLS,
  name: 'Clear URLs',
  version: '1.0.0',
  description: 'Strip tracking parameters from links before you send them.',
  authors: ['Beacon'],
  tags: ['privacy'],
  settings: [
    {
      key: 'params',
      type: 'text',
      label: 'Parameters to remove',
      description: 'Comma-separated. A trailing * matches a prefix.',
      defaultValue: DEFAULT_TRACKING_PARAMS,
      multiline: true,
    },
    {
      key: 'notify',
      type: 'toggle',
      label: 'Tell me when a link was cleaned',
      defaultValue: false,
    },
  ],

  start(ctx) {
    ctx.patcher.before(
      ConversationModel.prototype,
      'enqueueMessageForSend',
      args => {
        const [payload, ...rest] = args as [
          { body?: string; bodyRanges?: ReadonlyArray<unknown> } | undefined,
          ...Array<unknown>,
        ];
        if (!payload?.body || payload.bodyRanges?.length) {
          return undefined;
        }

        const body = cleanUrlsInText(
          payload.body,
          toParamMatchers(ctx.settings.get<string>('params'))
        );
        if (body === payload.body) {
          return undefined;
        }
        if (ctx.settings.get<boolean>('notify')) {
          ctx.ui.showNotification('Removed tracking parameters from link');
        }
        return [{ ...payload, body }, ...rest];
      }
    );
  },
} satisfies AddonManifest;
