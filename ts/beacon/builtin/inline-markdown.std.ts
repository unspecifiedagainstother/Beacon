// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { InlineMarkdown } from '../../quill/markdown/index.std.ts';

export const ICON_INLINE_MARKDOWN = defineIcon([
  'M3 6h18v12H3z',
  'M6 15V9l2.5 3L11 9v6',
  'M16 9v6',
  'M14 13l2 2 2-2',
]);

export default {
  id: 'inline-markdown',
  builtin: true,
  icon: ICON_INLINE_MARKDOWN,
  name: 'Inline markdown',
  version: '1.0.0',
  description:
    'Type **bold**, *italic*, ~~strike~~, `code` or ||spoiler|| and it turns into Signal formatting as you type. Ctrl+Z undoes it.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'enabled',
      type: 'toggle',
      symbol: 'text-square',
      label: 'Convert markdown while typing',
      defaultValue: true,
    },
  ],

  start(ctx) {
    const sync = () =>
      InlineMarkdown.enable(ctx.settings.get<boolean>('enabled'));
    sync();
    ctx.settings.onChange(sync);
    ctx.onDispose(() => InlineMarkdown.enable(false));
  },
} satisfies AddonManifest;
