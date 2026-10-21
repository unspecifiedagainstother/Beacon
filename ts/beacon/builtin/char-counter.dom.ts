// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Character counter in the message composer. Signal sends text longer than
 * 2 KiB (UTF-8) as an attached text file instead of a plain body; the
 * counter turns amber past that point.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { MAX_MESSAGE_BODY_BYTE_LENGTH } from '../../util/longAttachment.std.ts';

export const ICON_CHAR_COUNTER = defineIcon([
  'M4 7V5h16v2',
  'M12 5v14',
  'M9 19h6',
]);

const INPUT = '.module-composition-input__input';
const EDITOR = `${INPUT} .ql-editor`;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function countGraphemes(text: string): number {
  return Array.from(segmenter.segment(text)).length;
}

export default {
  id: 'char-counter',
  builtin: true,
  icon: ICON_CHAR_COUNTER,
  name: 'Character counter',
  version: '1.0.0',
  description:
    'Shows how long your message is while you type, and when it gets long enough to be sent as a file.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'showFrom',
      type: 'number',
      symbol: 'text-square',
      label: 'Show from (characters)',
      description: '0 shows it as soon as you type.',
      min: 0,
      max: 2000,
      defaultValue: 0,
    },
  ],

  start(ctx) {
    const counters = new WeakMap<Element, HTMLElement>();

    const update = (editor: Element) => {
      const input = editor.closest(INPUT);
      if (!input) {
        return;
      }
      let counter = counters.get(input);
      if (!counter) {
        counter = ctx.ui.createElement({
          tag: 'div',
          className: 'BeaconCharCounter',
          attrs: { 'aria-live': 'polite' },
        });
        input.appendChild(counter);
        counters.set(input, counter);
      }
      // Quill keeps a trailing newline in textContent-less form; innerText
      // gives what the user sees.
      const text = (editor as HTMLElement).innerText.replace(/\n$/, '');
      const chars = countGraphemes(text);
      const bytes = new TextEncoder().encode(text).length;
      const showFrom = ctx.settings.get<number>('showFrom');
      counter.hidden = chars === 0 || chars < showFrom;
      counter.textContent = String(chars);
      const long = bytes > MAX_MESSAGE_BODY_BYTE_LENGTH;
      counter.classList.toggle('BeaconCharCounter--long', long);
      counter.title = long
        ? 'Long message — Signal will send the text as a file'
        : `${bytes} of ${MAX_MESSAGE_BODY_BYTE_LENGTH} bytes before it’s sent as a file`;
    };

    const onInput = (ev: Event) => {
      const editor = (ev.target as Element | null)?.closest?.(EDITOR);
      if (editor) {
        update(editor);
      }
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('keyup', onInput, true);
    // Sending clears the editor without an input event.
    const observer = new MutationObserver(records => {
      for (const record of records) {
        const editor =
          (record.target as Element).closest?.(EDITOR) ??
          record.target.parentElement?.closest(EDITOR) ??
          null;
        if (editor) {
          update(editor);
          return;
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    ctx.onDispose(() => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('keyup', onInput, true);
      observer.disconnect();
      for (const el of document.querySelectorAll('.BeaconCharCounter')) {
        el.remove();
      }
    });
  },
} satisfies AddonManifest;
