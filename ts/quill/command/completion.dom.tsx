// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Command Completion — matches emoji completion UI exactly.
 * Uses module-composition-input__suggestions markup and styling.
 * Autocomplete for "/" commands in the composition input.
 */

import type { JSX } from 'react';
import Emitter from '@signalapp/quill-cjs/core/emitter.js';
import lodash from 'lodash';
import type Quill from '@signalapp/quill-cjs';
import { Popper } from 'react-popper';
import classNames from 'classnames';
import { createPortal } from 'react-dom';
import type { VirtualElement } from '@popperjs/core';
import { handleOutsideClick } from '../../util/handleOutsideClick.dom.ts';
import { commandRegistry } from '../../beacon/core/commands.dom.ts';
import { getSelectedConversationId } from '../../state/selectors/nav.std.ts';
import type { CommandDefinition } from '../../beacon/core/types.dom.ts';

const { debounce } = lodash;

export type CommandCompletionOptions = {
  onSelectCommand: (commandId: string) => void;
  setCommandPickerElement: (element: JSX.Element | null) => void;
};

type ParsedSlashLine = {
  slashIndex: number;
  query: string;
  argsRaw: string;
};

// oxlint-disable-next-line react/prefer-function-component
export class CommandCompletion {
  results: ReadonlyArray<CommandDefinition> = [];
  index = 0;
  options: CommandCompletionOptions;
  root: HTMLDivElement;
  quill: Quill;
  outsideClickDestructor?: () => void;
  #lastParsed: ParsedSlashLine | undefined;

  constructor(quill: Quill, options: CommandCompletionOptions) {
    this.options = options;
    this.root = document.body.appendChild(document.createElement('div'));
    this.quill = quill;

    const clearResults = () => {
      if (this.results.length) {
        this.reset();
      }
      return true;
    };

    const changeIndex = (by: number) => (): boolean => {
      if (this.results.length) {
        this.changeIndex(by);
        return false;
      }
      return true;
    };

    this.quill.keyboard.addBinding({ key: 'ArrowUp' }, changeIndex(-1));
    this.quill.keyboard.addBinding({ key: 'ArrowRight' }, clearResults);
    this.quill.keyboard.addBinding({ key: 'ArrowDown' }, changeIndex(1));
    this.quill.keyboard.addBinding({ key: 'ArrowLeft' }, clearResults);
    this.quill.keyboard.addBinding({ key: 'Enter' }, () =>
      this.insertCommand()
    );

    const debouncedOnTextChange = debounce(() => this.onTextChange(), 100);
    this.quill.on(Emitter.events.TEXT_CHANGE, (_now, _before, source) => {
      if (source !== Emitter.sources.USER) {
        return;
      }

      debouncedOnTextChange();
    });
  }

  destroy(): void {
    this.outsideClickDestructor?.();
    this.outsideClickDestructor = undefined;
    this.root.remove();
  }

  #getTextBeforeCursor(): string | undefined {
    const selection = this.quill.getSelection();
    if (selection == null) {
      return undefined;
    }
    const contents = this.quill.getContents(0, selection.index);
    let text = '';
    for (const op of contents.ops || []) {
      if (typeof op.insert === 'string') {
        text += op.insert;
      }
    }
    return text;
  }

  #parse(textBeforeCursor: string): ParsedSlashLine | undefined {
    const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
    const line = textBeforeCursor.slice(lineStart);
    if (!line.startsWith('/')) {
      return undefined;
    }
    const afterSlash = line.slice(1);
    const spaceIdx = afterSlash.search(/\s/);
    const query = spaceIdx === -1 ? afterSlash : afterSlash.slice(0, spaceIdx);
    const argsRaw = spaceIdx === -1 ? '' : afterSlash.slice(spaceIdx + 1);
    return { slashIndex: lineStart, query, argsRaw };
  }

  private onTextChange(): void {
    const text = this.#getTextBeforeCursor();
    if (text == null) {
      this.reset();
      return;
    }

    const parsed = this.#parse(text);
    if (!parsed) {
      this.reset();
      return;
    }

    this.#lastParsed = parsed;
    this.results = commandRegistry.search(parsed.query);
    this.index = 0;
    this.render(parsed.slashIndex);
  }

  private render(index: number): void {
    if (!this.results.length) {
      this.reset();
      return;
    }

    const virtualElement: VirtualElement = {
      getBoundingClientRect: () => {
        const selection = window.getSelection();
        if (selection != null && selection.rangeCount !== 0) {
          const range = selection.getRangeAt(0).cloneRange();
          range.collapse(true);

          const textBeforeCursor = range.endContainer.textContent?.slice(
            0,
            range.startOffset
          );
          const startOfSlash = textBeforeCursor?.lastIndexOf('/');

          if (
            textBeforeCursor &&
            startOfSlash !== undefined &&
            startOfSlash !== -1
          ) {
            range.setStart(range.endContainer, startOfSlash);
          }
          const [clientRect] = range.getClientRects();
          if (clientRect) {
            return clientRect;
          }
        }
        return new DOMRect();
      },
    };

    const element = createPortal(
      <Popper placement="top-start" referenceElement={virtualElement}>
        {({ ref, style }) => (
          <div
            ref={ref}
            style={style}
            className="module-composition-input__suggestions"
            role="listbox"
            aria-expanded
            aria-activedescendant={`command-result--${
              this.results.length ? this.results[this.index]?.id : ''
            }`}
            tabIndex={0}
          >
            {this.results.map((cmd, idx) => (
              <button
                type="button"
                key={cmd.id}
                id={`command-result--${cmd.id}`}
                role="option button"
                aria-selected={idx === this.index}
                className={classNames(
                  'module-composition-input__suggestions__row',
                  idx === this.index
                    ? 'module-composition-input__suggestions__row--selected'
                    : null
                )}
                onClick={() => this.selectCommand(idx)}
              >
                <div className="module-composition-input__suggestions__row__short-name">
                  {cmd.name}
                </div>
                {cmd.description && (
                  <div
                    className="module-composition-input__suggestions__row__description"
                    style={{ marginInlineStart: '8px', opacity: 0.7, fontSize: '12px' }}
                  >
                    {cmd.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </Popper>,
      this.root
    );

    this.options.setCommandPickerElement(createPortal(element, this.root));

    this.outsideClickDestructor?.();
    this.outsideClickDestructor = handleOutsideClick(
      () => {
        this.reset();
        this.quill.focus();
        return false;
      },
      {
        name: 'quill.command.completion',
        containerElements: [this.root, this.quill.root],
      }
    );
  }

  private changeIndex(by: number): void {
    this.index = Math.max(
      0,
      Math.min(this.results.length - 1, this.index + by)
    );
    const parsed = this.#lastParsed;
    if (parsed) {
      this.render(parsed.slashIndex);
    }
    this.quill.focus();
  }

  private insertCommand(): boolean {
    if (!this.results.length) {
      return true;
    }

    this.selectCommand(this.index);
    return false;
  }

  private selectCommand(idx: number): void {
    const selected = this.results[idx];
    if (!selected) {
      return;
    }

    const parsed = this.#lastParsed;
    const selection = this.quill.getSelection();
    let insertAt = parsed?.slashIndex ?? 0;

    if (parsed && selection) {
      this.quill.deleteText(
        parsed.slashIndex,
        selection.index - parsed.slashIndex
      );
      insertAt = parsed.slashIndex;
    }

    this.options.onSelectCommand(selected.id);

    const conversationId = window.reduxStore
      ? getSelectedConversationId(window.reduxStore.getState())
      : undefined;

    void commandRegistry.execute(selected.id, parsed?.argsRaw ?? '', {
      conversationId,
      insertText: text => {
        this.quill.insertText(insertAt, text, 'user');
        this.quill.setSelection(insertAt + text.length, 0);
      },
    });

    this.reset();
  }

  reset(): void {
    this.results = [];
    this.index = 0;
    this.#lastParsed = undefined;
    this.options.setCommandPickerElement(null);
    this.outsideClickDestructor?.();
  }
}
