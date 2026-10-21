// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sealed-sender indicator. Signal normally hides who sent a message from the
 * server ("sealed sender"); a message that arrived without it means the
 * server saw the sender. Message.dom.tsx tags incoming bubbles with
 * --beacon-sealed / --beacon-unsealed (from unidentifiedDeliveryReceived);
 * this draws a small mark next to the time.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_SEALED_SENDER } from '../addons/icons.std.ts';
import { iconToCssUrl, defineIcon } from '../core/icons.std.ts';

const OPEN_ENVELOPE = defineIcon(['M3 10l9-6 9 6v10H3z', 'M3 10l9 6 9-6']);

const mark = (selector: string, icon: string, color: string) => `
${selector} .module-message__metadata::before {
  content: '';
  display: inline-block;
  inline-size: 12px;
  block-size: 12px;
  margin-inline-end: 4px;
  vertical-align: -1px;
  background-color: ${color};
  -webkit-mask: ${iconToCssUrl(icon)} center / contain no-repeat;
  opacity: 0.8;
}`;

export default {
  id: 'sealed-sender',
  builtin: true,
  category: 'privacy',
  icon: ICON_SEALED_SENDER,
  name: 'Sealed sender',
  version: '1.0.0',
  description:
    'Mark messages that reached you without sealed sender, meaning Signal’s server could see who sent them.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'show',
      type: 'select',
      symbol: 'shield',
      label: 'Show on incoming messages',
      options: [
        { value: 'unsealed', label: 'Only when not sealed' },
        { value: 'both', label: 'Sealed and not sealed' },
        { value: 'off', label: 'Don’t show' },
      ],
      defaultValue: 'unsealed',
    },
  ],

  start(ctx) {
    let dispose: (() => void) | undefined;
    const sync = () => {
      dispose?.();
      dispose = undefined;
      const show = ctx.settings.get<string>('show');
      if (show === 'off') {
        return;
      }
      let css = mark(
        '.module-message__container--beacon-unsealed',
        OPEN_ENVELOPE,
        'var(--beacon-warning, #e3a008)'
      );
      if (show === 'both') {
        css += mark(
          '.module-message__container--beacon-sealed',
          ICON_SEALED_SENDER,
          'currentColor'
        );
      }
      dispose = ctx.css.inject(css);
    };
    sync();
    ctx.settings.onChange(sync);
  },
} satisfies AddonManifest;
