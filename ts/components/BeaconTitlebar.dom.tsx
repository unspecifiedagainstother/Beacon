// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';

import { drop } from '../util/drop.std.ts';
import { useCallback, useEffect, useState } from 'react';

export type PropsType = {
  title: string;
};

/**
 * Beacon: replacement for the OS titlebar, drawn with app styles.
 *
 * Only rendered when the window was created frameless — see
 * `getBeaconCustomTitlebar` in app/main.main.ts. The `frame` option is fixed at
 * window creation, so toggling the setting requires an app restart.
 *
 * The drag region is CSS (`-webkit-app-region: drag`); the buttons opt out with
 * `no-drag`, otherwise they would be swallowed by the drag handling.
 */
export function BeaconTitlebar({ title }: PropsType): JSX.Element {
  // App.dom.tsx has no i18n prop, and threading one through just for this would
  // touch upstream props. SignalContext is the same source the app uses.
  const { i18n } = window.SignalContext;
  const [isMaximized, setIsMaximized] = useState(false);

  // Overlays and dialogs read this to stay below the titlebar
  // (stylesheets/_beacon-theme.scss, "Custom titlebar stays on top").
  useEffect(() => {
    document.body.classList.add('beacon-has-titlebar');
    return () => document.body.classList.remove('beacon-has-titlebar');
  }, []);

  useEffect(() => {
    let canceled = false;

    // Seed from the current state — the window may already be maximized when
    // the renderer mounts (restored session, or a restart while maximized).
    const seed = async () => {
      const value = await window.IPC.beaconWindowIsMaximized();
      if (!canceled) {
        setIsMaximized(value);
      }
    };
    drop(seed());

    const unsubscribe = window.IPC.beaconOnWindowMaximizedChanged(value => {
      if (!canceled) {
        setIsMaximized(value);
      }
    });

    return () => {
      canceled = true;
      unsubscribe();
    };
  }, []);

  const onMinimize = useCallback(() => {
    window.IPC.beaconWindowMinimize();
  }, []);

  const onToggleMaximize = useCallback(() => {
    window.IPC.beaconWindowToggleMaximize();
  }, []);

  const onClose = useCallback(() => {
    window.IPC.beaconWindowClose();
  }, []);

  return (
    <div className="BeaconTitlebar">
      <div className="BeaconTitlebar__title">{title}</div>
      <div className="BeaconTitlebar__controls">
        <button
          aria-label={i18n('icu:BeaconTitlebar__minimize')}
          className="BeaconTitlebar__button BeaconTitlebar__button--minimize"
          onClick={onMinimize}
          type="button"
        />
        <button
          aria-label={
            isMaximized
              ? i18n('icu:BeaconTitlebar__restore')
              : i18n('icu:BeaconTitlebar__maximize')
          }
          className={`BeaconTitlebar__button BeaconTitlebar__button--${
            isMaximized ? 'restore' : 'maximize'
          }`}
          onClick={onToggleMaximize}
          type="button"
        />
        <button
          aria-label={i18n('icu:BeaconTitlebar__close')}
          className="BeaconTitlebar__button BeaconTitlebar__button--close"
          onClick={onClose}
          type="button"
        />
      </div>
    </div>
  );
}
