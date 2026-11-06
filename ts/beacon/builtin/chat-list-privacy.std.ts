// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_CHAT_LIST_PRIVACY } from '../addons/icons.std.ts';

const ROW = '.module-conversation-list__item--contact-or-conversation';
const PREVIEW = `${ROW}__content__message__text`;
const NAME = `${ROW}__content__header__name`;
const AVATAR = `${ROW}__avatar-container`;

const CSS = `
body.beacon-chatlist-blur-previews ${PREVIEW},
body.beacon-chatlist-blur-names ${NAME},
body.beacon-chatlist-blur-avatars ${AVATAR} {
  filter: blur(5px);
  transition: filter 120ms ease;
}
body.beacon-chatlist-blur-avatars ${AVATAR} {
  filter: blur(4px) saturate(0.6);
}
body.beacon-chatlist-reveal ${ROW}:hover ${PREVIEW},
body.beacon-chatlist-reveal ${ROW}:hover ${NAME},
body.beacon-chatlist-reveal ${ROW}:hover ${AVATAR},
body.beacon-chatlist-reveal ${ROW}:focus-visible ${PREVIEW},
body.beacon-chatlist-reveal ${ROW}:focus-visible ${NAME},
body.beacon-chatlist-reveal ${ROW}:focus-visible ${AVATAR} {
  filter: none;
}
`;

const CLASSES: Record<string, string> = {
  blurPreviews: 'beacon-chatlist-blur-previews',
  blurNames: 'beacon-chatlist-blur-names',
  blurAvatars: 'beacon-chatlist-blur-avatars',
  revealOnHover: 'beacon-chatlist-reveal',
};

export default {
  id: 'chat-list-privacy',
  builtin: true,
  category: 'privacy',
  icon: ICON_CHAT_LIST_PRIVACY,
  name: 'Chat list',
  version: '1.0.0',
  description:
    'Hide what the chat list shows to anyone looking at your screen.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'blurPreviews',
      type: 'toggle',
      symbol: 'blur',
      label: 'Blur message previews',
      defaultValue: true,
    },
    {
      key: 'blurNames',
      type: 'toggle',
      symbol: 'person',
      label: 'Blur chat names',
      defaultValue: false,
    },
    {
      key: 'blurAvatars',
      type: 'toggle',
      symbol: 'person-circle',
      label: 'Blur profile photos',
      defaultValue: false,
    },
    {
      key: 'revealOnHover',
      type: 'toggle',
      symbol: 'eyes',
      label: 'Reveal on hover',
      defaultValue: true,
    },
  ],

  start(ctx) {
    ctx.css.inject(CSS);
    const applied = new Map<string, () => void>();
    const sync = () => {
      for (const [key, className] of Object.entries(CLASSES)) {
        const on = ctx.settings.get<boolean>(key);
        const disposer = applied.get(key);
        if (on && !disposer) {
          applied.set(key, ctx.css.bodyClass(className));
        } else if (!on && disposer) {
          disposer();
          applied.delete(key);
        }
      }
    };
    sync();
    ctx.settings.onChange(sync);
  },
} satisfies AddonManifest;
