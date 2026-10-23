// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { AxoButton } from '../axo/AxoButton.dom.tsx';
import { drop } from '../util/drop.std.ts';

/**
 * Beacon wordmark for the setup screens, in the spot and size Signal uses
 * for its own (StandaloneRegistration--SignalLogo). For an extra account
 * that isn't signed in yet, it also offers a way back to the others.
 */
export function BeaconSetupBrand(): JSX.Element {
  const [isExtraAccount, setIsExtraAccount] = useState(false);

  useEffect(() => {
    let cancelled = false;
    drop(
      (async () => {
        try {
          const self = (await window.IPC.beaconInvoke('accounts:self')) as {
            isMain: boolean;
          };
          if (!cancelled) {
            setIsExtraAccount(!self.isMain);
          }
        } catch {
          // Older main process or no IPC: nothing to go back to.
        }
      })()
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="StandaloneRegistration--SignalLogo BeaconSetupBrand">
      Beacon
      {isExtraAccount ? (
        <span className="BeaconSetupBrand__back">
          <AxoButton.Root
            variant="subtle-secondary"
            size="sm"
            onClick={() =>
              drop(window.IPC.beaconInvoke('accounts:switch', 'main'))
            }
          >
            Back to your accounts
          </AxoButton.Root>
        </span>
      ) : null}
    </div>
  );
}
