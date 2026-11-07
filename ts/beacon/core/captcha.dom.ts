// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Open Signal's captcha in Beacon's own window (app/beacon-captcha.main.ts),
 * falling back to the system browser if that fails. The token comes back
 * through the same ChallengeMainHandler path either way.
 */

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
