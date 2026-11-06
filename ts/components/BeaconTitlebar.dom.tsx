// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';

import { drop } from '../util/drop.std.ts';
import { useCallback, useEffect, useState } from 'react';

export type PropsType = {
  title: string;
};

export function BeaconTitlebar({ title }: PropsType): JSX.Element {
  const { i18n } = window.SignalContext;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    document.body.classList.add('beacon-has-titlebar');
    return () => document.body.classList.remove('beacon-has-titlebar');
  }, []);

  useEffect(() => {
    let canceled = false;

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
