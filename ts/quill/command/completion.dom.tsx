// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import Emitter from '@signalapp/quill-cjs/core/emitter.js';
import lodash from 'lodash';
import type Quill from '@signalapp/quill-cjs';
import { Popper } from 'react-popper';
import classNames from 'classnames';
import { createPortal } from 'react-dom';
import type { VirtualElement } from '@popperjs/core';
import { handleOutsideClick } from '../../util/handleOutsideClick.dom.ts';
import { drop } from '../../util/drop.std.ts';
import { commandRegistry } from '../../beacon/core/commands.dom.ts';
import { getSelectedConversationId } from '../../state/selectors/nav.std.ts';
import type { CommandDefinition } from '../../beacon/core/types.dom.ts';
import { iconToCssUrl } from '../../beacon/core/icons.std.ts';

const { debounce } = lodash;

type CommandSource = { name: string; icon?: string };

function getSources(): Map<string, CommandSource> {
  const map = new Map<string, CommandSource>();
  for (const addon of window.Beacon?.loader.list() ?? []) {
    map.set(addon.id, { name: addon.name, icon: addon.icon });
  }
  return map;
}

const CORE_SOURCE: CommandSource = { name: 'Beacon' };

export type CommandCompletionOptions = {
  onSelectCommand: (commandId: string) => void;
  setCommandPickerElement: (element: JSX.Element | null) => void;
};

type ParsedSlashLine = {
  slashIndex: number;
  query: string;
  argsRaw: string;
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
    this.quill.keyboard.addBinding({ key: 'Escape' }, (): boolean => {
      if (this.results.length) {
        this.reset();
        return false;
      }
      return true;
    });

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
    if (parsed.hasArgs) {
      const exact = commandRegistry.get(parsed.query);
      this.results = exact ? [exact] : [];
    } else if (parsed.query === '') {
      const sources = getSources();
      const groupName = (cmd: CommandDefinition) =>
        cmd.addonId ? (sources.get(cmd.addonId)?.name ?? cmd.addonId) : '';
      this.results = commandRegistry
        .list()
        .sort(
          (a, b) =>
            groupName(a).localeCompare(groupName(b)) || a.id.localeCompare(b.id)
        );
    } else {
      this.results = commandRegistry.search(parsed.query);
    }
    this.index = 0;
    this.render();
  }

  handleEnter(): boolean {
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

    const pick = this.results.length ? this.results[this.index] : undefined;
    if (pick && !parsed.hasArgs) {
      this.#run(pick, parsed);
      return true;
    }

    return false;
  }

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

    const sources = getSources();
    const sourceOf = (cmd: CommandDefinition): CommandSource =>
      cmd.addonId
        ? (sources.get(cmd.addonId) ?? { name: cmd.addonId })
        : CORE_SOURCE;
    const query = parsed?.hasArgs ? '' : (parsed?.query ?? '');
    const grouped = query === '' && !parsed?.hasArgs;

    const element = createPortal(
      <Popper placement="top-start" referenceElement={virtualElement}>
        {({ ref, style }) => (
          <div ref={ref} style={style} className="BeaconCommands">
            <div className="BeaconCommands__header">
              <span className="BeaconCommands__title">
                {parsed?.hasArgs ? 'Usage' : 'Commands'}
              </span>
              <span className="BeaconCommands__count">
                {this.results.length}
              </span>
            </div>
            <div
              className="BeaconCommands__list"
              role="listbox"
              aria-label="Commands"
              aria-activedescendant={`command-result--${
                this.results[this.index]?.id ?? ''
              }`}
              tabIndex={-1}
            >
              {this.results.map((cmd, idx) => {
                const source = sourceOf(cmd);
                const previous = idx > 0 ? this.results[idx - 1] : undefined;
                const showGroup =
                  grouped &&
                  (!previous || sourceOf(previous).name !== source.name);
                const iconUrl = iconToCssUrl(source.icon);
                const selected = idx === this.index;
                const matchLength = cmd.id.startsWith(query.toLowerCase())
                  ? query.length
                  : 0;
                return (
                  <div key={cmd.id} role="presentation">
                    {showGroup ? (
                      <div
                        className="BeaconCommands__group"
                        role="presentation"
                      >
                        {source.name}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      id={`command-result--${cmd.id}`}
                      role="option"
                      aria-selected={selected}
                      ref={el => {
                        if (selected) {
                          el?.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                      className={classNames(
                        'BeaconCommands__row',
                        selected && 'BeaconCommands__row--selected'
                      )}
                      onMouseDown={ev => ev.preventDefault()}
                      onMouseMove={() => {
                        if (this.index !== idx) {
                          this.index = idx;
                          this.render();
                        }
                      }}
                      onClick={() => this.selectCommand(idx)}
                    >
                      {iconUrl ? (
                        <span
                          className="BeaconCommands__icon"
                          style={{
                            maskImage: iconUrl,
                            WebkitMaskImage: iconUrl,
                          }}
                          aria-hidden
                        />
                      ) : null}
                      <span className="BeaconCommands__text">
                        <span className="BeaconCommands__line">
                          <span className="BeaconCommands__name">
                            /<mark>{cmd.id.slice(0, matchLength)}</mark>
                            {cmd.id.slice(matchLength)}
                          </span>
                          {cmd.usage ? (
                            <span className="BeaconCommands__usage">
                              {cmd.usage}
                            </span>
                          ) : null}
                          {!grouped ? (
                            <span className="BeaconCommands__source">
                              {source.name}
                            </span>
                          ) : null}
                        </span>
                        {cmd.description ? (
                          <span className="BeaconCommands__description">
                            {cmd.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="BeaconCommands__footer">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> select
              </span>
              <span>
                <kbd>Tab</kbd> complete
              </span>
              <span>
                <kbd>Enter</kbd> run
              </span>
              <span>
                <kbd>Esc</kbd> close
              </span>
            </div>
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

    drop(
      commandRegistry.execute(command.id, parsed.argsRaw, {
        conversationId,
        insertText: text => {
          this.quill.insertText(insertAt, text, 'user');
          this.quill.setSelection(insertAt + text.length, 0);
        },
      })
    );

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
