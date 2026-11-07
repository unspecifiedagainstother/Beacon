// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

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
      text += typeof op.insert === 'string' ? op.insert : '￼';
    }
    return text;
  }

  convertAt(end: number): void {
    if (end > this.quill.getLength()) {
      return;
    }
    const match = findInlineMarkdown(this.#textBeforeCursor(end));
    if (!match) {
      return;
    }
    const { style, openStart, closeStart, delimiterLength: d } = match;

    if (
      style !== 'monospace' &&
      this.quill.getFormat(closeStart - 1, 1).monospace
    ) {
      return;
    }

    const innerLength = closeStart - openStart - d;
    const user = Emitter.sources.USER;
    this.quill.deleteText(closeStart, d, user);
    this.quill.deleteText(openStart, d, user);
    this.quill.formatText(openStart, innerLength, style, true, user);

    const spanEnd = openStart + innerLength;
    const selection = this.quill.getSelection();
    if (selection && selection.length === 0 && selection.index === spanEnd) {
      this.quill.format(style, false, Emitter.sources.SILENT);
    }
  }
}
