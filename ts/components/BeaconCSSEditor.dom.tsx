// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';

import type { LocalizerType } from '../types/Util.std.ts';
import { AxoSwitch } from '../axo/AxoSwitch.dom.tsx';
import { tokenizeCss } from '../beacon/util/cssHighlight.std.ts';

const STORAGE_KEY = 'beacon-custom-css';
const STYLE_ID = 'beacon-custom-css';
const INDENT = '  ';

/** Number of rules the browser accepts, or undefined if it cannot parse. */
export function countCssRules(source: string): number | undefined {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    return sheet.cssRules.length;
  } catch {
    return undefined;
  }
}

export function getCustomCSS(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Inject custom CSS into the document. Replaces any previous injected CSS.
 */
export function injectCustomCSS(css: string): void {
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

/**
 * Load and inject saved CSS on app startup.
 */
export function loadAndInjectCustomCSS(): void {
  const css = getCustomCSS();
  if (css) {
    injectCustomCSS(css);
  }
}

function Highlighted({ source }: { source: string }): JSX.Element {
  const tokens = useMemo(() => tokenizeCss(source), [source]);
  return (
    <>
      {tokens.map((token, idx) =>
        token.kind === 'space' ? (
          token.text
        ) : (
          <span
            // Tokens are positional; the index is the identity.
            // oxlint-disable-next-line react/no-array-index-key
            key={idx}
            className={`BeaconCode__tok BeaconCode__tok--${token.kind}`}
          >
            {token.text}
          </span>
        )
      )}
      {/* Keep a trailing newline visible so the layers stay the same height. */}
      {'\n'}
    </>
  );
}

export type DialogProps = {
  i18n: LocalizerType;
  onClose: () => void;
};

/**
 * Full-window CSS editor with syntax highlighting, line numbers and live
 * preview. Highlighting is a <pre> layer under a transparent <textarea>, so
 * editing keeps native undo, selection and IME behaviour.
 */
export function BeaconCSSEditorDialog({
  i18n,
  onClose,
}: DialogProps): JSX.Element {
  const saved = useMemo(() => getCustomCSS(), []);
  const [draft, setDraft] = useState(saved);
  const [livePreview, setLivePreview] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineCount = useMemo(() => draft.split('\n').length, [draft]);
  const ruleCount = useMemo(() => countCssRules(draft), [draft]);
  const isDirty = draft !== saved;

  // Live preview applies the draft; closing without saving restores `saved`.
  useEffect(() => {
    injectCustomCSS(livePreview ? draft : saved);
  }, [draft, livePreview, saved]);

  const cancel = useCallback(() => {
    injectCustomCSS(saved);
    onClose();
  }, [onClose, saved]);

  const save = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, draft);
    } catch {
      // Quota or storage disabled: keep the preview for this session.
    }
    injectCustomCSS(draft);
    onClose();
  }, [draft, onClose]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        cancel();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [cancel]);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) {
      return;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  };

  const onKeyDown = (ev: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const ta = ev.currentTarget;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
      ev.preventDefault();
      save();
      return;
    }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const { selectionStart: start, selectionEnd: end } = ta;
      // execCommand keeps the edit on the native undo stack.
      document.execCommand('insertText', false, INDENT);
      if (start === end) {
        return;
      }
      ta.setSelectionRange(start + INDENT.length, end + INDENT.length);
    }
  };

  return createPortal(
    <div className="BeaconModal">
      <div
        className="BeaconModal__overlay"
        role="presentation"
        onClick={cancel}
      />
      <div
        className="BeaconModal__content BeaconModal__content--editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beacon-css-editor-title"
      >
        <div className="BeaconModal__header">
          <div className="BeaconModal__heading">
            <h2 className="BeaconModal__title" id="beacon-css-editor-title">
              {i18n('icu:Beacon__css-editor-title')}
            </h2>
            <p className="BeaconModal__subtitle">
              {i18n('icu:Beacon__css-editor-description')}
            </p>
          </div>
          <button
            type="button"
            className="BeaconModal__close"
            aria-label={i18n('icu:Beacon__css-editor-cancel')}
            onClick={cancel}
          />
        </div>

        <div className="BeaconCode">
          <div className="BeaconCode__gutter" ref={gutterRef} aria-hidden>
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <div className="BeaconCode__editor">
            <pre
              className="BeaconCode__highlight"
              ref={highlightRef}
              aria-hidden
            >
              <Highlighted source={draft} />
            </pre>
            <textarea
              ref={textareaRef}
              className="BeaconCode__input"
              value={draft}
              onChange={ev => setDraft(ev.currentTarget.value)}
              onScroll={syncScroll}
              onKeyDown={onKeyDown}
              placeholder={i18n('icu:Beacon__css-editor-placeholder')}
              aria-label={i18n('icu:Beacon__css-editor-title')}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              wrap="off"
              autoFocus
            />
          </div>
        </div>

        <div className="BeaconModal__actions BeaconModal__actions--spread">
          <div className="BeaconCode__status">
            <label className="BeaconCode__preview">
              <AxoSwitch.Root
                checked={livePreview}
                onCheckedChange={setLivePreview}
              />
              <span>{i18n('icu:Beacon__css-editor-live-preview')}</span>
            </label>
            <span
              className={classNames(
                'BeaconCode__count',
                ruleCount === undefined && 'BeaconCode__count--error'
              )}
            >
              {ruleCount === undefined
                ? i18n('icu:Beacon__css-editor-invalid')
                : i18n('icu:Beacon__css-editor-rules', { count: ruleCount })}
            </span>
          </div>
          <div className="BeaconModal__buttons">
            <button
              type="button"
              className="BeaconButton BeaconButton--ghost"
              disabled={draft === ''}
              onClick={() => setDraft('')}
            >
              {i18n('icu:Beacon__css-editor-clear')}
            </button>
            <button type="button" className="BeaconButton" onClick={cancel}>
              {i18n('icu:Beacon__css-editor-cancel')}
            </button>
            <button
              type="button"
              className="BeaconButton BeaconButton--primary"
              disabled={!isDirty}
              onClick={save}
            >
              {i18n('icu:Beacon__css-editor-save')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
