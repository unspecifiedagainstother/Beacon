// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { AxoButton } from '../axo/AxoButton.dom.tsx';
import { drop } from '../util/drop.std.ts';

/**
 * Setup card corner button for an extra account that isn't signed in yet:
 * goes back to the main account. Renders nothing for the main account.
 */
export function BeaconAccountBackButton(): JSX.Element | null {
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
          // No IPC: nothing to go back to.
        }
      })()
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isExtraAccount) {
    return null;
  }
  return (
    <div className="BeaconSetup__account-back">
      <AxoButton.Root
        variant="subtle-secondary"
        size="sm"
        onClick={() => drop(window.IPC.beaconInvoke('accounts:switch', 'main'))}
      >
        Back
      </AxoButton.Root>
    </div>
  );
}
