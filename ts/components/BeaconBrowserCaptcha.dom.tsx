// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useState } from 'react';

import { AxoButton } from '../axo/AxoButton.dom.tsx';
import { drop } from '../util/drop.std.ts';

/**
 * Fallback for the registration captcha: solve it in your own browser and
 * paste the "Open Signal" link back (the way signal-cli does it). Signal
 * can reject captchas solved in the in-app window; a real browser profile
 * passes more reliably.
 */
export function BeaconBrowserCaptcha(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const start = () => {
    setOpen(true);
    drop(window.IPC.beaconInvoke('captcha:open-external', 'registration'));
  };

  const submit = async () => {
    const ok = await window.IPC.beaconInvoke('captcha:submit', value);
    if (ok === true) {
      setError(undefined);
      setValue('');
      setOpen(false);
    } else {
      setError('That isn’t a Signal captcha link.');
    }
  };

  if (!open) {
    return (
      <div className="BeaconBrowserCaptcha">
        <AxoButton.Root variant="implied-secondary" size="sm" onClick={start}>
          Not working? Solve it in your browser instead
        </AxoButton.Root>
      </div>
    );
  }

  return (
    <div className="BeaconBrowserCaptcha BeaconBrowserCaptcha--open">
      <ol className="BeaconBrowserCaptcha__steps">
        <li>Solve the captcha in the browser window that opened.</li>
        <li>
          When it finishes, right-click <strong>Open Signal</strong> and copy
          the link.
        </li>
        <li>Paste it here.</li>
      </ol>
      <div className="BeaconBrowserCaptcha__row">
        <input
          className="BeaconInput"
          type="text"
          spellCheck={false}
          placeholder="signalcaptcha://signal-hcaptcha…"
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && value.trim()) {
              drop(submit());
            }
          }}
        />
        <AxoButton.Root
          variant="strong-primary"
          size="md"
          disabled={!value.trim()}
          onClick={() => drop(submit())}
        >
          Continue
        </AxoButton.Root>
      </div>
      {error ? <p className="BeaconBrowserCaptcha__error">{error}</p> : null}
      <AxoButton.Root variant="implied-secondary" size="sm" onClick={start}>
        Open the captcha page again
      </AxoButton.Root>
    </div>
  );
}
