// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Passphrase encryption of the database key.
 *
 * Signal encrypts its SQLite database with a random key and keeps that key
 * in config.json, protected by the OS keychain (safeStorage). Anyone who
 * can use your user account can therefore open the database. With this
 * turned on, Beacon instead stores the key wrapped with your passphrase
 * (scrypt → AES-256-GCM) and removes the keychain copy; at startup a small
 * window asks for the passphrase before the database is opened.
 *
 * There is no recovery: forgetting the passphrase means the local data is
 * gone (re-link the device to start over).
 */

import { BrowserWindow, app, safeStorage } from 'electron';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
} from 'node:crypto';
import { promisify } from 'node:util';

import * as userConfig from './user_config.main.ts';
import type { LoggerType } from '../ts/types/Logging.std.ts';
import { drop } from '../ts/util/drop.std.ts';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer<ArrayBuffer>,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer<ArrayBuffer>>;

const CONFIG_KEY = 'beaconWrappedKey';
// ~64 MiB, ~0.3 s on a laptop: slow enough to make guessing expensive.
const SCRYPT = { N: 2 ** 16, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };

type WrappedKey = {
  v: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
  n: number;
  r: number;
  p: number;
};

function readWrapped(): WrappedKey | undefined {
  const value = userConfig.get(CONFIG_KEY);
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as WrappedKey;
    return parsed.v === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// The key the database was opened with this session, so it can be wrapped
// (or re-stored) later without asking the keychain again.
let unlockedKey: string | undefined;
let unlockedWithPassphrase = false;

export function setUnlockedDatabaseKey(
  key: string,
  viaPassphrase: boolean
): void {
  unlockedKey = key;
  unlockedWithPassphrase = viaPassphrase;
}

export function getDatabasePassphraseStatus(): {
  enabled: boolean;
  unlockedAtStartup: boolean;
} {
  return {
    enabled: isDatabasePassphraseEnabled(),
    unlockedAtStartup: unlockedWithPassphrase,
  };
}

export function isDatabasePassphraseEnabled(): boolean {
  return readWrapped() !== undefined;
}

async function deriveKey(
  passphrase: string,
  salt: Buffer<ArrayBuffer>,
  params: { n: number; r: number; p: number }
): Promise<Buffer<ArrayBuffer>> {
  return scrypt(passphrase.normalize('NFC'), salt, 32, {
    N: params.n,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT.maxmem,
  });
}

async function wrap(sqlKey: string, passphrase: string): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const params = { n: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p };
  const key = await deriveKey(passphrase, salt, params);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(sqlKey, 'utf8'), cipher.final()]);
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    ...params,
  };
}

/** Throws on a wrong passphrase. */
async function unwrap(
  wrapped: WrappedKey,
  passphrase: string
): Promise<string> {
  const key = await deriveKey(
    passphrase,
    Buffer.from(wrapped.salt, 'base64'),
    wrapped
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(wrapped.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(wrapped.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(wrapped.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Turn passphrase protection on. `currentKey` is the key Signal is using
 * right now. The keychain/plaintext copies are removed
 * only after the wrapped copy has been verified.
 */
export async function enableDatabasePassphrase(
  passphrase: string
): Promise<void> {
  const currentKey = unlockedKey;
  if (!currentKey) {
    throw new Error('Database is not open');
  }
  if (passphrase.length < 8) {
    throw new Error('Passphrase too short');
  }
  const wrapped = await wrap(currentKey, passphrase);
  if ((await unwrap(wrapped, passphrase)) !== currentKey) {
    throw new Error('Verification of the wrapped key failed');
  }
  userConfig.set(CONFIG_KEY, JSON.stringify(wrapped));
  userConfig.set('encryptedKey', undefined);
  userConfig.set('key', undefined);
}

/** Change the passphrase. Returns false when `current` is wrong. */
export async function changeDatabasePassphrase(
  current: string,
  next: string
): Promise<boolean> {
  if (next.length < 8) {
    throw new Error('Passphrase too short');
  }
  const wrapped = readWrapped();
  if (!wrapped) {
    return false;
  }
  let sqlKey: string;
  try {
    sqlKey = await unwrap(wrapped, current);
  } catch {
    return false;
  }
  userConfig.set(CONFIG_KEY, JSON.stringify(await wrap(sqlKey, next)));
  return true;
}

/**
 * Turn protection off: the key goes back into the OS keychain (or plain
 * config where no keychain exists, as Signal does). False on a wrong
 * passphrase.
 */
export async function disableDatabasePassphrase(
  passphrase: string
): Promise<boolean> {
  const wrapped = readWrapped();
  if (!wrapped) {
    return true;
  }
  let sqlKey: string;
  try {
    sqlKey = await unwrap(wrapped, passphrase);
  } catch {
    return false;
  }
  if (safeStorage.isEncryptionAvailable()) {
    userConfig.set(
      'encryptedKey',
      safeStorage.encryptString(sqlKey).toString('hex')
    );
  } else {
    userConfig.set('key', sqlKey);
  }
  userConfig.set(CONFIG_KEY, undefined);
  return true;
}

// ---------------------------------------------------------------------------
// Startup prompt
// ---------------------------------------------------------------------------

const PROMPT_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Unlock Beacon</title><style>
html,body{margin:0;height:100%;background:#1f1f1f;color:#eee;font:14px system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center;-webkit-app-region:drag}
form{display:flex;flex-direction:column;gap:12px;width:280px;-webkit-app-region:no-drag}
h1{margin:0 0 4px;font-size:17px;font-weight:600;text-align:center}
p{margin:0;font-size:12px;color:#aaa;text-align:center}
input{padding:10px 12px;border:1px solid #444;border-radius:6px;background:#2a2a2a;color:#fff;font:inherit}
input:focus{outline:none;border-color:#2c6bed}
button{padding:10px;border:0;border-radius:6px;background:#2c6bed;color:#fff;font:inherit;font-weight:600;cursor:pointer}
button:disabled{opacity:.6;cursor:default}
#err{min-height:16px;color:#f28b82}
</style></head><body><form id="f">
<h1>Unlock Beacon</h1><p>Your messages are encrypted with your passphrase.</p>
<input id="pw" type="password" autofocus placeholder="Passphrase" autocomplete="current-password">
<p id="err"></p><button id="go" type="submit">Unlock</button></form>
<script>
const f=document.getElementById('f'),pw=document.getElementById('pw'),go=document.getElementById('go'),err=document.getElementById('err');
window.beaconUnlockFailed=(m)=>{err.textContent=m;go.disabled=false;go.textContent='Unlock';pw.value='';pw.focus();document.title='Unlock Beacon';};
f.addEventListener('submit',e=>{e.preventDefault();if(!pw.value)return;go.disabled=true;go.textContent='Unlocking…';err.textContent='';
const b=btoa(unescape(encodeURIComponent(pw.value)));pw.value='';document.title='BEACON_SUBMIT:'+b;});
</script></body></html>`;

/**
 * If protection is on, ask for the passphrase and return the database key.
 * Returns undefined when protection is off (use Signal's normal key).
 * Quits the app if the window is closed.
 */
export async function promptForDatabaseKey(
  log: LoggerType
): Promise<string | undefined> {
  const wrapped = readWrapped();
  if (!wrapped) {
    return undefined;
  }
  log.info('beacon dbcrypt: database key is passphrase-protected, prompting');

  return new Promise(resolve => {
    const win = new BrowserWindow({
      width: 380,
      height: 300,
      resizable: false,
      maximizable: false,
      minimizable: true,
      title: 'Unlock Beacon',
      backgroundColor: '#1f1f1f',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: true,
        spellcheck: false,
      },
    });
    let done = false;
    let failures = 0;

    win.webContents.on('page-title-updated', (event, title) => {
      if (!title.startsWith('BEACON_SUBMIT:')) {
        return;
      }
      event.preventDefault();
      const passphrase = Buffer.from(
        title.slice('BEACON_SUBMIT:'.length),
        'base64'
      ).toString('utf8');
      drop(
        (async () => {
          try {
            const key = await unwrap(wrapped, passphrase);
            done = true;
            log.info('beacon dbcrypt: unlocked');
            resolve(key);
            win.close();
          } catch {
            failures += 1;
            log.warn('beacon dbcrypt: wrong passphrase');
            // Back-off after repeated failures.
            const delay = failures >= 5 ? Math.min(30, 2 ** (failures - 4)) : 0;
            await new Promise(r => setTimeout(r, delay * 1000));
            if (!win.isDestroyed()) {
              drop(
                win.webContents.executeJavaScript(
                  `window.beaconUnlockFailed(${JSON.stringify(
                    'Wrong passphrase.'
                  )})`
                )
              );
            }
          }
        })()
      );
    });
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => {
      if (!done) {
        log.info('beacon dbcrypt: prompt closed without unlocking, quitting');
        app.exit(0);
      }
    });
    // A data: URL arrives empty here, so write the page into about:blank.
    drop(
      (async () => {
        await win.loadURL('about:blank');
        await win.webContents.executeJavaScript(
          `document.open();document.write(${JSON.stringify(PROMPT_HTML)});document.close();`
        );
        if (!win.isVisible()) {
          win.show();
        }
      })()
    );
  });
}
