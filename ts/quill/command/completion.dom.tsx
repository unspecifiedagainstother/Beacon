// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Slash-command completion for the composer.
 *
 * Reuses the emoji/mention suggestion markup so it looks native. Enter and
 * Tab are routed here from CompositionInput's own key handlers (which run
 * before module bindings), so a typed command is executed — never sent to
 * the contact as text — even when it is typed faster than the popup's
 * debounce.
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

const MAX_RESULTS = 8;

export type CommandCompletionOptions = {
  onSelectCommand: (commandId: string) => void;
  setCommandPickerElement: (element: JSX.Element | null) => void;
};

type ParsedSlashLine = {
  /** Index of the '/' in the document. */
  slashIndex: number;
  /** Command word typed so far (without '/'). */
  query: string;
  argsRaw: string;
  /** True once a space follows the command word. */
  hasArgs: boolean;
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
  readonly #debouncedOnTextChange: ReturnType<typeof debounce>;

  constructor(quill: Quill, options: CommandCompletionOptions) {
    this.options = options;
    this.root = document.body.appendChild(document.createElement('div'));
    this.quill = quill;

    const changeIndex = (by: number) => (): boolean => {
      if (this.results.length) {
        this.changeIndex(by);
        return false;
      }
      return true;
    };

    this.quill.keyboard.addBinding({ key: 'ArrowUp' }, changeIndex(-1));
    this.quill.keyboard.addBinding({ key: 'ArrowDown' }, changeIndex(1));

    this.#debouncedOnTextChange = debounce(() => this.onTextChange(), 60);
    this.quill.on(Emitter.events.TEXT_CHANGE, (_now, _before, source) => {
      if (source !== Emitter.sources.USER) {
        return;
      }
      this.#debouncedOnTextChange();
    });
  }

  destroy(): void {
    this.#debouncedOnTextChange.cancel();
    this.reset();
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
      } else {
        // Embeds (emoji blots, mentions) occupy one index each.
        text += '￼';
      }
    }
    return text;
  }

  #parse(textBeforeCursor: string): ParsedSlashLine | undefined {
    const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
    const line = textBeforeCursor.slice(lineStart);
    if (!line.startsWith('/') || line.startsWith('//')) {
      return undefined;
    }
    const afterSlash = line.slice(1);
    const spaceIdx = afterSlash.search(/\s/);
    const query = spaceIdx === -1 ? afterSlash : afterSlash.slice(0, spaceIdx);
    const argsRaw = spaceIdx === -1 ? '' : afterSlash.slice(spaceIdx + 1);
    return { slashIndex: lineStart, query, argsRaw, hasArgs: spaceIdx !== -1 };
  }

  private onTextChange(): void {
    const text = this.#getTextBeforeCursor();
    const parsed = text == null ? undefined : this.#parse(text);
    if (!parsed) {
      this.reset();
      return;
    }

    this.#lastParsed = parsed;
    // Once arguments are being typed, only the exact command stays listed —
    // it acts as a usage hint.
    if (parsed.hasArgs) {
      const exact = commandRegistry.get(parsed.query);
      this.results = exact ? [exact] : [];
    } else {
      this.results = commandRegistry.search(parsed.query).slice(0, MAX_RESULTS);
    }
    this.index = 0;
    this.render();
  }

  /**
   * Called from CompositionInput's Enter handler. Returns true when Enter was
   * consumed (a command ran), false to let the message send normally.
   */
  handleEnter(): boolean {
    // Resolve synchronously: the debounced popup may not be up yet.
    this.#debouncedOnTextChange.cancel();
    const text = this.#getTextBeforeCursor();
    const parsed = text == null ? undefined : this.#parse(text);
    if (!parsed) {
      this.reset();
      return false;
    }
    this.#lastParsed = parsed;

    const exact = commandRegistry.get(parsed.query);
    if (exact) {
      this.#run(exact, parsed);
      return true;
    }

    // Popup open on a partial word: run the highlighted suggestion. Without
    // a visible popup, a non-command like "/r/funny" is sent as text.
    const pick = this.results.length ? this.results[this.index] : undefined;
    if (pick && !parsed.hasArgs) {
      this.#run(pick, parsed);
      return true;
    }

    return false;
  }

  /** Tab completes the command word without running it. */
  handleTab(): boolean {
    if (!this.results.length || !this.#lastParsed) {
      return false;
    }
    const selected = this.results[this.index];
    if (!selected || this.#lastParsed.hasArgs) {
      return false;
    }
    const { slashIndex, query } = this.#lastParsed;
    const replacement = `/${selected.id} `;
    this.quill.deleteText(slashIndex, query.length + 1, 'user');
    this.quill.insertText(slashIndex, replacement, 'user');
    this.quill.setSelection(slashIndex + replacement.length, 0, 'user');
    this.onTextChange();
    return true;
  }

  private render(): void {
    if (!this.results.length) {
      this.reset();
      return;
    }

    const parsed = this.#lastParsed;
    const virtualElement: VirtualElement = {
      getBoundingClientRect: () => {
        if (parsed) {
          const bounds = this.quill.getBounds(parsed.slashIndex);
          const editor = this.quill.root.getBoundingClientRect();
          if (bounds) {
            return new DOMRect(
              editor.left + bounds.left,
              editor.top + bounds.top,
              bounds.width,
              bounds.height
            );
          }
        }
        return this.quill.root.getBoundingClientRect();
      },
    };

    const element = createPortal(
      <Popper placement="top-start" referenceElement={virtualElement}>
        {({ ref, style }) => (
          <div
            ref={ref}
            style={style}
            className="module-composition-input__suggestions BeaconCommandSuggestions"
            role="listbox"
            aria-expanded
            aria-activedescendant={`command-result--${
              this.results[this.index]?.id ?? ''
            }`}
            tabIndex={0}
          >
            {this.results.map((cmd, idx) => (
              <button
                type="button"
                key={cmd.id}
                id={`command-result--${cmd.id}`}
                role="option"
                aria-selected={idx === this.index}
                className={classNames(
                  'module-composition-input__suggestions__row',
                  'BeaconCommandSuggestions__row',
                  idx === this.index
                    ? 'module-composition-input__suggestions__row--selected'
                    : null
                )}
                onMouseDown={ev => ev.preventDefault()}
                onClick={() => this.selectCommand(idx)}
              >
                <span className="BeaconCommandSuggestions__name">
                  /{cmd.id}
                  {cmd.usage ? (
                    <span className="BeaconCommandSuggestions__usage">
                      {' '}
                      {cmd.usage}
                    </span>
                  ) : null}
                </span>
                {cmd.description ? (
                  <span className="BeaconCommandSuggestions__description">
                    {cmd.description}
                  </span>
                ) : null}
                {cmd.addonId ? (
                  <span className="BeaconCommandSuggestions__source">
                    {cmd.addonId}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </Popper>,
      this.root
    );

    this.options.setCommandPickerElement(element);

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
    const n = this.results.length;
    this.index = (this.index + by + n) % n;
    this.render();
    this.quill.focus();
  }

  private selectCommand(idx: number): void {
    const selected = this.results[idx];
    const parsed = this.#lastParsed;
    if (!selected || !parsed) {
      return;
    }
    this.#run(selected, parsed);
  }

  #run(command: CommandDefinition, parsed: ParsedSlashLine): void {
    // Remove "/cmd args" from the composer, then let the command insert.
    const selection = this.quill.getSelection();
    const end = selection?.index ?? parsed.slashIndex;
    if (end > parsed.slashIndex) {
      this.quill.deleteText(parsed.slashIndex, end - parsed.slashIndex, 'user');
    }
    const insertAt = parsed.slashIndex;

    this.options.onSelectCommand(command.id);

    const conversationId = window.reduxStore
      ? getSelectedConversationId(window.reduxStore.getState())
      : undefined;

    void commandRegistry.execute(command.id, parsed.argsRaw, {
      conversationId,
      insertText: text => {
        this.quill.insertText(insertAt, text, 'user');
        this.quill.setSelection(insertAt + text.length, 0);
      },
    });

    this.reset();
  }

  reset(): void {
    if (this.results.length === 0 && this.#lastParsed === undefined) {
      return;
    }
    this.results = [];
    this.index = 0;
    this.#lastParsed = undefined;
    this.options.setCommandPickerElement(null);
    this.outsideClickDestructor?.();
    this.outsideClickDestructor = undefined;
  }
}
