// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useCallback, useState } from 'react';

import type { LocalizerType } from '../types/Util.std.ts';
import { Button, ButtonVariant } from './Button.dom.tsx';

export type PropsType = {
  i18n: LocalizerType;
};

// Reached via the window global so this stays a renderer-only module; the
// loader itself lives in preload land (ts/beacon/core/loader.preload.ts).
function getLoader() {
  return window.Beacon.loader;
}

export function BeaconModules({ i18n }: PropsType): JSX.Element {
  const [addons, setAddons] = useState(() => getLoader().list());
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const hasAddons = addons.length > 0;

  const toggleAddon = useCallback(async (id: string, enabled: boolean) => {
    setBusy(id);
    try {
      if (enabled) {
        await getLoader().disable(id);
      } else {
        await getLoader().enable(id);
      }
    } finally {
      setAddons(getLoader().list());
      setBusy(undefined);
    }
  }, []);

  return (
    <div className="BeaconModules">
      <p className="BeaconModules__description">
        {i18n('icu:Beacon__modules-description')}
      </p>

      {!hasAddons ? (
        <div className="BeaconModules__empty">
          {i18n('icu:Beacon__modules-empty')}
        </div>
      ) : (
        <div className="BeaconModules__list">
          {addons.map(addon => (
            <div key={addon.id} className="BeaconModules__item">
              <div className="BeaconModules__item-header">
                <div className="BeaconModules__item-id">
                  {addon.name}
                  {addon.version ? ` v${addon.version}` : null}
                </div>
                <div className="BeaconModules__item-status">
                  {addon.enabled ? (
                    <span className="BeaconModules__badge BeaconModules__badge--enabled">
                      {i18n('icu:Beacon__modules-enabled')}
                    </span>
                  ) : (
                    <span className="BeaconModules__badge BeaconModules__badge--disabled">
                      {i18n('icu:Beacon__modules-disabled')}
                    </span>
                  )}
                </div>
              </div>
              {addon.description ? (
                <div className="BeaconModules__item-description">
                  {addon.description}
                </div>
              ) : null}
              <div className="BeaconModules__item-actions">
                <Button
                  onClick={() => void toggleAddon(addon.id, addon.enabled)}
                  variant={ButtonVariant.Secondary}
                  disabled={busy === addon.id}
                >
                  {addon.enabled
                    ? i18n('icu:Beacon__modules-disable')
                    : i18n('icu:Beacon__modules-enable')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
