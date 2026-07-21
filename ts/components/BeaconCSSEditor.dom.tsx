// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useCallback, useState } from 'react';

import type { LocalizerType } from '../types/Util.std.ts';
import { Button, ButtonVariant } from './Button.dom.tsx';
import { Modal } from './Modal.dom.tsx';

const STORAGE_KEY = 'beacon-custom-css';

export type PropsType = {
  i18n: LocalizerType;
};

export function BeaconCSSEditor({ i18n }: PropsType): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [css, setCss] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [unsavedCSS, setUnsavedCSS] = useState(css);

  const onOpen = useCallback(() => {
    setUnsavedCSS(css);
    setIsOpen(true);
  }, [css]);

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const onSave = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, unsavedCSS);
      setCss(unsavedCSS);
      injectCustomCSS(unsavedCSS);
      setIsOpen(false);
    } catch (e) {
      // localStorage might be full or unavailable
      console.error('Failed to save CSS:', e);
    }
  }, [unsavedCSS]);

  const onReset = useCallback(() => {
    setUnsavedCSS('');
  }, []);

  return (
    <>
      <Button
        onClick={onOpen}
        variant={ButtonVariant.Secondary}
        className="BeaconCSSEditor__button"
      >
        {i18n('icu:Beacon__css-editor-button')}
      </Button>

      {isOpen && (
        <Modal
          i18n={i18n}
          modalName="BeaconCSSEditor"
          hasXButton
          onClose={onClose}
          title={i18n('icu:Beacon__css-editor-title')}
        >
          <div className="BeaconCSSEditor__modal">
            <p className="BeaconCSSEditor__description">
              {i18n('icu:Beacon__css-editor-description')}
            </p>
            <textarea
              className="BeaconCSSEditor__textarea"
              value={unsavedCSS}
              onChange={e => setUnsavedCSS(e.currentTarget.value)}
              placeholder={i18n('icu:Beacon__css-editor-placeholder')}
              spellCheck={false}
              autoFocus
            />
            <div className="BeaconCSSEditor__footer">
              <div className="BeaconCSSEditor__size-hint">
                {unsavedCSS.length} characters
              </div>
              <div className="BeaconCSSEditor__actions">
                <Button
                  onClick={onSave}
                  variant={ButtonVariant.Primary}
                >
                  {i18n('icu:Beacon__css-editor-save')}
                </Button>
                <Button
                  onClick={onReset}
                  variant={ButtonVariant.Secondary}
                >
                  {i18n('icu:Beacon__css-editor-clear')}
                </Button>
                <Button
                  onClick={onClose}
                  variant={ButtonVariant.Secondary}
                >
                  {i18n('icu:Beacon__css-editor-cancel')}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Inject custom CSS into the document. Replaces any previous injected CSS.
 */
export function injectCustomCSS(css: string): void {
  let styleEl = document.getElementById('beacon-custom-css');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'beacon-custom-css';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

/**
 * Load and inject saved CSS on app startup.
 */
export function loadAndInjectCustomCSS(): void {
  try {
    const css = localStorage.getItem(STORAGE_KEY) || '';
    if (css) {
      injectCustomCSS(css);
    }
  } catch {
    // localStorage might be unavailable
  }
}
