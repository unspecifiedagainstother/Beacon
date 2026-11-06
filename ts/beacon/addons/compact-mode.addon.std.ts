// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest, Disposer } from '../core/types.dom.ts';
import { ICON_COMPACT_MODE } from './icons.std.ts';

export default {
  id: 'compact-mode',
  icon: ICON_COMPACT_MODE,
  name: 'Compact Mode',
  version: '1.0.0',
  description: 'Denser timeline: tighter bubbles, smaller gaps and text.',
  authors: ['Beacon'],
  tags: ['ui'],
  settings: [
    {
      key: 'density',
      type: 'select',
      label: 'Density',
      defaultValue: 'compact',
      options: [
        { label: 'Cozy', value: 'cozy' },
        { label: 'Compact', value: 'compact' },
        { label: 'Ultra compact', value: 'ultra' },
      ],
    },
    {
      key: 'fontSize',
      type: 'number',
      label: 'Message text size (px)',
      description: '0 keeps Signal’s size.',
      defaultValue: 0,
      min: 0,
      max: 22,
    },
    {
      key: 'hideAvatars',
      type: 'toggle',
      label: 'Hide avatars in group chats',
      defaultValue: false,
    },
  ],

  start(ctx) {
    let dispose: Disposer | undefined;

    const apply = () => {
      dispose?.();
      const density = ctx.settings.get<string>('density');
      const gap = { cozy: 4, compact: 2, ultra: 0 }[density] ?? 2;
      const padY = { cozy: 6, compact: 4, ultra: 2 }[density] ?? 4;
      const padX = { cozy: 10, compact: 9, ultra: 8 }[density] ?? 9;
      const fontSize = ctx.settings.get<number>('fontSize');

      dispose = ctx.css.inject(`
.module-timeline__messages__container .module-message__container-outer {
  margin-block: ${gap}px !important;
}
.module-message__container {
  padding-block: ${padY}px !important;
  padding-inline: ${padX}px !important;
}
.module-message__metadata {
  margin-block-start: ${Math.max(0, padY - 3)}px !important;
}
${
  fontSize > 0
    ? `.module-message__text { font-size: ${fontSize}px !important; line-height: 1.35 !important; }`
    : ''
}
${
  ctx.settings.get<boolean>('hideAvatars')
    ? `.module-message__author-avatar-container,
.module-message__typing-avatar-spacer { display: none !important; }`
    : ''
}
`);
    };

    apply();
    ctx.settings.onChange(() => apply());
  },
} satisfies AddonManifest;
