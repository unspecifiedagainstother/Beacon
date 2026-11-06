// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_TEXT_REPLACE } from './icons.std.ts';
import { ConversationModel } from '../../models/conversations.preload.ts';
import {
  applyReplaceRules,
  parseReplaceRules,
} from '../util/textReplace.std.ts';

const EXAMPLE_RULES = [
  '# One rule per line: find => replace',
  '# Regex: /pattern/flags => replacement ($1 for groups)',
  'idk => I don’t know',
  '/\\bteh\\b/i => the',
].join('\n');

export default {
  id: 'text-replace',
  icon: ICON_TEXT_REPLACE,
  name: 'Text Replace',
  version: '1.0.0',
  description:
    'Find/replace rules (plain or regex) applied to messages you send.',
  authors: ['Beacon'],
  tags: ['chat'],
  settings: [
    {
      key: 'rules',
      type: 'text',
      label: 'Rules',
      description:
        'find => replace, one per line. Lines starting with # are ignored.',
      defaultValue: EXAMPLE_RULES,
      multiline: true,
    },
  ],

  start(ctx) {
    let parsed = parseReplaceRules(ctx.settings.get<string>('rules'));
    const warn = () => {
      if (parsed.errors.length) {
        ctx.ui.showNotification(
          `Text Replace: ${parsed.errors.join('; ')}`,
          'warning'
        );
      }
    };
    warn();
    ctx.settings.onChange(key => {
      if (key === 'rules') {
        parsed = parseReplaceRules(ctx.settings.get<string>('rules'));
        warn();
      }
    });

    ctx.patcher.before(
      ConversationModel.prototype,
      'enqueueMessageForSend',
      args => {
        const [payload, ...rest] = args as [
          { body?: string; bodyRanges?: ReadonlyArray<unknown> } | undefined,
          ...Array<unknown>,
        ];
        if (
          !payload?.body ||
          payload.bodyRanges?.length ||
          !parsed.rules.length
        ) {
          return undefined;
        }
        const body = applyReplaceRules(payload.body, parsed.rules);
        return body === payload.body
          ? undefined
          : [{ ...payload, body }, ...rest];
      }
    );

    ctx.commands.register({
      id: 'replacetest',
      name: 'Test text replace',
      usage: '<text>',
      description: 'Show what your rules would turn the text into',
      execute: cmd =>
        cmd.reply(applyReplaceRules(cmd.argsRaw, parsed.rules) || '(empty)'),
    });
  },
} satisfies AddonManifest;
