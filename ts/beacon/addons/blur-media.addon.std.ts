// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest, Disposer } from '../core/types.dom.ts';
import { ICON_BLUR_MEDIA } from './icons.std.ts';

const MEDIA = ['.module-message .module-image', '.module-message video'];
const STICKERS = ['.module-message .module-message__sticker-container'];
const AVATARS = [
  '.module-message__author-avatar-container .module-Avatar',
  '.module-conversation-list__item--contact-or-conversation .module-Avatar',
];

function buildCss(selectors: Array<string>, radius: number, reveal: string) {
  const list = selectors.join(',\n');
  const hover =
    reveal === 'hover'
      ? selectors.map(s => `${s}:hover`).join(',\n')
      : undefined;
  return `
${list} {
  filter: blur(${radius}px);
}
${hover ? `${hover} { filter: none; }` : ''}
`;
}

export default {
  id: 'blur-media',
  icon: ICON_BLUR_MEDIA,
  name: 'Blur Media',
  version: '1.0.0',
  description:
    'Blur images, videos and previews in chats until you hover them.',
  authors: ['Beacon'],
  tags: ['privacy'],
  settings: [
    {
      key: 'reveal',
      type: 'select',
      label: 'Reveal',
      defaultValue: 'hover',
      options: [
        { label: 'On hover', value: 'hover' },
        { label: 'Never (always blurred)', value: 'never' },
      ],
    },
    {
      key: 'radius',
      type: 'number',
      label: 'Blur strength',
      defaultValue: 18,
      min: 4,
      max: 40,
    },
    {
      key: 'stickers',
      type: 'toggle',
      label: 'Blur stickers',
      defaultValue: false,
    },
    {
      key: 'avatars',
      type: 'toggle',
      label: 'Blur avatars',
      defaultValue: false,
    },
  ],

  start(ctx) {
    let dispose: Disposer | undefined;
    const apply = () => {
      dispose?.();
      const selectors = [
        ...MEDIA,
        ...(ctx.settings.get<boolean>('stickers') ? STICKERS : []),
        ...(ctx.settings.get<boolean>('avatars') ? AVATARS : []),
      ];
      dispose = ctx.css.inject(
        buildCss(
          selectors,
          ctx.settings.get<number>('radius'),
          ctx.settings.get<string>('reveal')
        )
      );
    };
    apply();
    ctx.settings.onChange(() => apply());

    ctx.keybinds.register('mod+alt+b', () => {
      const next =
        ctx.settings.get<string>('reveal') === 'hover' ? 'never' : 'hover';
      ctx.settings.set('reveal', next);
      ctx.ui.showNotification(
        next === 'never' ? 'Media stays blurred' : 'Hover to reveal media'
      );
    });
  },
} satisfies AddonManifest;
