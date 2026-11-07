// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Saving Beacon exports (message log, profile history, ...).
 *
 * With the encrypted-exports built-in on (the default) every export asks for
 * a password and is written as a beacon-encrypted-export file; the Privacy
 * tab can decrypt it again. Off, exports are plain JSON as before.
 */

import { addonSettings } from './settings.std.ts';
import { askPassword } from './prompts.dom.ts';
import { showNotification } from './ui.dom.ts';
import {
  decryptExport,
  encryptExport,
  isEncryptedExport,
} from '../util/encryptedExport.std.ts';

export const ENCRYPTED_EXPORTS_ID = 'encrypted-exports';

function download(text: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Returns false when the user cancelled the password prompt. */
export async function saveBeaconExport(options: {
  /** Without extension, e.g. "beacon-message-log-2026-10-21". */
  basename: string;
  /** Authenticated with the file; shown when decrypting. */
  label: string;
  data: unknown;
}): Promise<boolean> {
  const json = JSON.stringify(options.data, null, 2);
  const encrypt = addonSettings.get<boolean>(ENCRYPTED_EXPORTS_ID, 'enabled');

  if (!encrypt) {
    download(json, `${options.basename}.json`);
    showNotification(
      'Exported — the file is NOT encrypted (Settings → Privacy → Exports)',
      'warning'
    );
    return true;
  }

  const password = await askPassword({
    title: 'Encrypt export',
    intro:
      'Choose a password for this file. Without it the file cannot be opened — Beacon does not keep a copy.',
    confirm: true,
    submitLabel: 'Encrypt and save',
  });
  if (password == null) {
    return false;
  }
  showNotification('Encrypting…');
  const file = await encryptExport(json, password, options.label);
  download(JSON.stringify(file), `${options.basename}.beacon-enc.json`);
  showNotification('Encrypted export saved', 'success');
  return true;
}

/** Pick an encrypted export, ask its password, save the plaintext JSON. */
export async function decryptBeaconExportFile(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  const picked = await new Promise<File | undefined>(resolve => {
    input.addEventListener('change', () => resolve(input.files?.[0]));
    input.addEventListener('cancel', () => resolve(undefined));
    input.click();
  });
  if (!picked) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await picked.text());
  } catch {
    parsed = undefined;
  }
  if (!isEncryptedExport(parsed)) {
    showNotification('That is not a Beacon encrypted export', 'error');
    return;
  }

  const password = await askPassword({
    title: `Decrypt “${parsed.label}”`,
    submitLabel: 'Decrypt',
  });
  if (password == null) {
    return;
  }
  let plaintext: string;
  try {
    plaintext = await decryptExport(parsed, password);
  } catch {
    showNotification('Wrong password, or the file was modified', 'error');
    return;
  }
  download(
    plaintext,
    picked.name.replace(/\.beacon-enc\.json$|\.json$/, '') + '.decrypted.json'
  );
  showNotification('Decrypted copy saved — it is NOT encrypted', 'warning');
}
