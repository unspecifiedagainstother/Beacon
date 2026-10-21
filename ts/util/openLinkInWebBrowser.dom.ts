// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { isValidLink } from '../types/LinkPreview.std.ts';
import { applyBeaconFilter } from '../beacon/core/filters.std.ts';

export function openLinkInWebBrowser(url: string): void {
  if (!isValidLink(url)) {
    return;
  }
  // Beacon: link safety may take over (confirm, clean) and open it itself.
  const target = applyBeaconFilter('link.open', url, { source: 'app' });
  if (!target) {
    return;
  }
  window.location.href = target;
}
