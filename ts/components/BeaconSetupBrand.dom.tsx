// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';

/**
 * Beacon wordmark for the setup screens, in the spot and size Signal uses
 * for its own (StandaloneRegistration--SignalLogo).
 */
export function BeaconSetupBrand(): JSX.Element {
  return (
    <div className="StandaloneRegistration--SignalLogo BeaconSetupBrand">
      Beacon
    </div>
  );
}
