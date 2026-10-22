// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Live inline markdown in the composer: typing the closing delimiter of
 * **bold**, *italic* / _italic_, ~~strike~~ / ~strike~, `monospace` or
 * ||spoiler|| removes the delimiters and applies Signal's own formatting
 * (the same formats as the formatting menu and Ctrl+B etc.), so what is
 * sent is a normal formatted Signal message. Ctrl+Z restores the markdown.
 */

import Emitter from '@signalapp/quill-cjs/core/emitter.js';
import type Quill from '@signalapp/quill-cjs';

import { findInlineMarkdown } from './match.std.ts';

let isEnabled = true;

export class InlineMarkdown {
  quill: Quill;

  constructor(quill: Quill) {
    this.quill = quill;
    this.quill.on(Emitter.events.TEXT_CHANGE, (delta, _before, source) => {
      if (source !== Emitter.sources.USER || !isEnabled) {
        return;
      }
      // Only typed characters: one single-character insert. Its position
      // comes from the delta, not the selection, so fast typing (where the
      // next key lands before our timeout) can't make us miss it.
      let index = 0;
      let typedAt: number | undefined;
      for (const op of delta.ops ?? []) {
        if (typeof op.retain === 'number') {
          index += op.retain;
        } else if (op.insert !== undefined) {
          if (
            typedAt !== undefined ||
            typeof op.insert !== 'string' ||
            op.insert.length !== 1
          ) {
            return;
          }
          typedAt = index + 1;
          index += 1;
        }
      }
      if (typedAt === undefined) {
        return;
      }
      const end = typedAt;
      setTimeout(() => this.convertAt(end), 0);
    });
  }

  static enable(value: boolean): void {
    isEnabled = value;
  }

  #textBeforeCursor(index: number): string {
    let text = '';
    for (const op of this.quill.getContents(0, index).ops ?? []) {
      // Embeds (emoji, mentions) take one index each.
      text += typeof op.insert === 'string' ? op.insert : '￼';
    }
    return text;
  }

  /** `end`: index just after the character that was typed. */
  convertAt(end: number): void {
    if (end > this.quill.getLength()) {
      return;
    }
    const match = findInlineMarkdown(this.#textBeforeCursor(end));
    if (!match) {
      return;
    }
    const { style, openStart, closeStart, delimiterLength: d } = match;

    // Leave markdown characters inside code spans alone.
    if (
      style !== 'monospace' &&
      this.quill.getFormat(closeStart - 1, 1).monospace
    ) {
      return;
    }

    const innerLength = closeStart - openStart - d;
    const user = Emitter.sources.USER;
    // Closing first so the opening index stays valid. Quill shifts the
    // selection along with these edits.
    this.quill.deleteText(closeStart, d, user);
    this.quill.deleteText(openStart, d, user);
    this.quill.formatText(openStart, innerLength, style, true, user);

    // If the cursor sits right after the span, keep typing unformatted.
    const spanEnd = openStart + innerLength;
    const selection = this.quill.getSelection();
    if (selection && selection.length === 0 && selection.index === spanEnd) {
      this.quill.format(style, false, Emitter.sources.SILENT);
    }
  }
}
