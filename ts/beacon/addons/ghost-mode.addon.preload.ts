// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_GHOST_MODE } from './icons.std.ts';
import { ConversationModel } from '../../models/conversations.preload.ts';
import {
  conversationJobQueue,
  conversationQueueJobEnum,
} from '../../jobs/conversationJobQueue.preload.ts';
import { ReceiptType } from '../../types/Receipt.std.ts';

export default {
  id: 'ghost-mode',
  icon: ICON_GHOST_MODE,
  name: 'Ghost Mode',
  version: '3.0.0',
  description:
    'Stop sending typing indicators and read receipts while still seeing everyone else’s.',
  authors: ['Beacon'],
  tags: ['privacy'],
  settings: [
    {
      key: 'blockTyping',
      type: 'toggle',
      label: 'Hide my typing',
      defaultValue: true,
    },
    {
      key: 'blockReadReceipts',
      type: 'toggle',
      label: 'Hide my read receipts',
      description: 'Your own linked devices are still told what you read.',
      defaultValue: true,
    },
    {
      key: 'indicator',
      type: 'toggle',
      label: 'Show ghost badge in the composer',
      defaultValue: true,
    },
  ],

  start(ctx) {
    ctx.patcher.instead(
      ConversationModel.prototype,
      'sendTypingMessage',
      (args, original) =>
        ctx.settings.get<boolean>('blockTyping')
          ? Promise.resolve()
          : original(...args)
    );

    ctx.patcher.instead(conversationJobQueue, 'add', (args, original) => {
      const [data] = args as [
        { type?: string; receiptsType?: string } | undefined,
      ];
      if (
        ctx.settings.get<boolean>('blockReadReceipts') &&
        data?.type === conversationQueueJobEnum.enum.Receipts &&
        data.receiptsType === ReceiptType.Read
      ) {
        return Promise.resolve(undefined);
      }
      return original(...args);
    });

    const applyIndicator = (() => {
      let dispose: (() => void) | undefined;
      return () => {
        dispose?.();
        dispose = ctx.settings.get<boolean>('indicator')
          ? ctx.css.bodyClass('Beacon--ghost')
          : undefined;
      };
    })();
    applyIndicator();
    ctx.settings.onChange(key => {
      if (key === 'indicator') {
        applyIndicator();
      }
    });

    ctx.commands.register({
      id: 'ghost',
      name: 'Ghost mode status',
      description: 'Show what Ghost Mode is currently blocking',
      execute: cmd => {
        const blocked = [
          ctx.settings.get<boolean>('blockTyping') && 'typing',
          ctx.settings.get<boolean>('blockReadReceipts') && 'read receipts',
        ].filter(Boolean);
        cmd.reply(
          blocked.length
            ? `Ghost mode: hiding ${blocked.join(' and ')}`
            : 'Ghost mode is on but blocking nothing',
          'info'
        );
      },
    });
  },
} satisfies AddonManifest;
