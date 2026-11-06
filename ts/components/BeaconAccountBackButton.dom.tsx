// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { AxoButton } from '../axo/AxoButton.dom.tsx';
import { drop } from '../util/drop.std.ts';
import { noop } from 'lodash';

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
          noop();
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
        onClick={() => drop(window.IPC.beaconInvoke('accounts:cancelSetup'))}
      >
        Back
      </AxoButton.Root>
    </div>
  );
}
