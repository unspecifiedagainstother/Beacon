// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../../logging/log.std.ts';
import { drop } from '../../util/drop.std.ts';

const log = createLogger('beacon/captcha');

export function openCaptcha(kind: 'chat' | 'registration', url: string): void {
  drop(
    (async () => {
      try {
        const opened = await window.IPC.beaconInvoke('captcha:open', kind);
        if (opened === true) {
          return;
        }
      } catch (error) {
        log.warn('in-app captcha failed, using the browser', error);
      }
      document.location.href = url;
    })()
  );
}
