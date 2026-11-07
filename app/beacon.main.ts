// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { BrowserWindow, Session } from 'electron';
import { app, ipcMain, powerMonitor, shell } from 'electron';
import * as ephemeralConfig from './ephemeral_config.main.ts';
import { drop } from '../ts/util/drop.std.ts';
import {
  captchaTokenFromUrl,
  closeCaptchaWindow,
  openCaptchaWindow,
} from './beacon-captcha.main.ts';
import { accountsRequest, reportAccountInfo } from './beacon-accounts.main.ts';
import { getAccountId, isMainAccount } from './beacon-account-path.node.ts';
import {
  changeDatabasePassphrase,
  disableDatabasePassphrase,
  enableDatabasePassphrase,
  getDatabasePassphraseStatus,
} from './beacon-dbcrypt.main.ts';
import type { LoggerType } from '../ts/types/Logging.std.ts';

const CONTENT_PROTECTION_KEY = 'beacon-content-protection';
const PROXY_KEY = 'beacon-proxy-url';
const PROXY_SCHEMES = new Set([
  'http:',
  'https:',
  'socks:',
  'socks4:',
  'socks4a:',
  'socks5:',
  'socks5h:',
]);
const BLOCK_SPELLCHECK_KEY = 'beacon-block-spellcheck-download';

const BLOCKED_DICTIONARY_URL = 'https://127.0.0.1:9/beacon-blocked/';
const SPELLCHECK_DEFAULT_URL = `https://updates.signal.org/desktop/hunspell_dictionaries/${process.versions.electron}/`;

const MAX_REQUEST_LOG = 1000;

export type BeaconNetworkEvent = {
  at: number;
  host: string;
  method: string;
  resourceType: string;
  statusCode: number;
  fromCache: boolean;
};

type Options = {
  session: Session;
  getMainWindow: () => BrowserWindow | undefined;
  log: LoggerType;
  captcha: {
    urls: { chat: string; registration: string };
    onToken: (token: string) => void;
  };
};

let options: Options | undefined;
const requestLog: Array<BeaconNetworkEvent> = [];

function getBool(key: string): boolean {
  return ephemeralConfig.get(key) === true;
}

function applySpellcheckBlock(session: Session): void {
  session.setSpellCheckerDictionaryDownloadURL(
    getBool(BLOCK_SPELLCHECK_KEY)
      ? BLOCKED_DICTIONARY_URL
      : SPELLCHECK_DEFAULT_URL
  );
}

function getProxyUrl(): string | undefined {
  const value = ephemeralConfig.get(PROXY_KEY);
  return typeof value === 'string' && value ? value : undefined;
}

// RFC1918, loopback, link-local, and other private ranges that must not
// be used as a proxy target — doing so could redirect Signal traffic to a
// local attacker-controlled service.
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^0\.0\.0\.0$/,
];

export function validateProxyUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Not a valid URL (example: socks5h://127.0.0.1:9050)';
  }
  if (!PROXY_SCHEMES.has(url.protocol)) {
    return `Unsupported proxy type ${url.protocol} — use http, https or socks5`;
  }
  if (!url.hostname || !url.port) {
    return 'Include a host and port, e.g. socks5h://127.0.0.1:9050';
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || PRIVATE_IP_PATTERNS.some(p => p.test(host))) {
    return 'Proxy must not point to a local or private address';
  }
  return undefined;
}

export function applyBeaconProxyEnv(): void {
  const proxy = getProxyUrl();
  if (proxy && !process.env.HTTPS_PROXY && !process.env.https_proxy) {
    process.env.HTTPS_PROXY = proxy;
  }
}

export function applyBeaconWindowSettings(window: BrowserWindow): void {
  window.setContentProtection(getBool(CONTENT_PROTECTION_KEY));
}

const HANDLERS: Record<string, (payload: unknown) => unknown> = {
  'settings:get': () => ({
    contentProtection: getBool(CONTENT_PROTECTION_KEY),
    blockSpellcheckDownload: getBool(BLOCK_SPELLCHECK_KEY),
    platform: process.platform,
  }),

  'content-protection:set': payload => {
    const value = payload === true;
    ephemeralConfig.set(CONTENT_PROTECTION_KEY, value);
    const window = options?.getMainWindow();
    if (window) {
      applyBeaconWindowSettings(window);
    }
    return value;
  },

  'spellcheck-block:set': payload => {
    const value = payload === true;
    ephemeralConfig.set(BLOCK_SPELLCHECK_KEY, value);
    if (options) {
      applySpellcheckBlock(options.session);
    }
    return value;
  },

  'captcha:open': payload => {
    if (!options) {
      return false;
    }
    const { captcha, getMainWindow, log } = options;
    openCaptchaWindow({
      parent: getMainWindow(),
      url:
        payload === 'registration'
          ? captcha.urls.registration
          : captcha.urls.chat,
      onToken: captcha.onToken,
      log,
    });
    return true;
  },

  'captcha:open-external': payload => {
    if (!options) {
      return false;
    }
    closeCaptchaWindow();
    const { urls } = options.captcha;
    drop(
      shell.openExternal(
        payload === 'registration' ? urls.registration : urls.chat
      )
    );
    return true;
  },

  'captcha:submit': payload => {
    const raw = typeof payload === 'string' ? payload.trim() : '';
    const token =
      captchaTokenFromUrl(raw) ??
      (/^signal-[a-z0-9-]*captcha[^\s/]*\.\S+$/i.test(raw) ? raw : undefined);
    if (!options || !token) {
      return false;
    }
    options.log.info(
      `beacon captcha: pasted token (${token.split('.').slice(0, 3).join('.')}…)`
    );
    options.captcha.onToken(token);
    return true;
  },

  'proxy:get': () => ({
    proxyUrl: getProxyUrl() ?? '',
    fromEnvironment:
      process.env.HTTPS_PROXY !== undefined &&
      process.env.HTTPS_PROXY !== getProxyUrl(),
  }),

  'proxy:set': payload => {
    const value = typeof payload === 'string' ? payload.trim() : '';
    if (value) {
      const error = validateProxyUrl(value);
      if (error) {
        return { ok: false, error };
      }
    }
    ephemeralConfig.set(PROXY_KEY, value || undefined);
    return { ok: true, restartNeeded: true };
  },

  'dbcrypt:status': () => getDatabasePassphraseStatus(),

  'dbcrypt:enable': async payload => {
    if (typeof payload !== 'string') {
      return { ok: false, error: 'Missing passphrase' };
    }
    try {
      await enableDatabasePassphrase(payload);
      options?.log.info('beacon dbcrypt: passphrase protection enabled');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  },

  'dbcrypt:change': async payload => {
    const { current, next } = (payload ?? {}) as {
      current?: unknown;
      next?: unknown;
    };
    if (typeof current !== 'string' || typeof next !== 'string') {
      return { ok: false, error: 'Missing passphrase' };
    }
    try {
      const ok = await changeDatabasePassphrase(current, next);
      return ok ? { ok: true } : { ok: false, error: 'Wrong passphrase' };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  },

  'dbcrypt:disable': async payload => {
    if (typeof payload !== 'string') {
      return { ok: false, error: 'Missing passphrase' };
    }
    const ok = await disableDatabasePassphrase(payload);
    if (ok) {
      options?.log.info('beacon dbcrypt: passphrase protection disabled');
    }
    return ok ? { ok: true } : { ok: false, error: 'Wrong passphrase' };
  },

  'accounts:self': () => ({
    id: getAccountId(),
    isMain: isMainAccount(),
  }),
  'accounts:list': () => accountsRequest('list'),
  'accounts:switch': payload => accountsRequest('switch', String(payload)),
  'accounts:add': () => accountsRequest('add'),
  'accounts:remove': payload => accountsRequest('remove', String(payload)),
  'accounts:cancelSetup': () => accountsRequest('cancelSetup'),
  'accounts:report': payload => {
    if (payload && typeof payload === 'object') {
      reportAccountInfo(payload);
    }
    return true;
  },

  'network:log': () => (app.isPackaged ? [] : requestLog.slice()),

  'network:clear': () => {
    if (!app.isPackaged) {
      requestLog.length = 0;
    }
    return true;
  },
};

export function setupBeaconMain(opts: Options): void {
  options = opts;
  applySpellcheckBlock(opts.session);

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) {
    const rules = proxy.replace(/^socks5h:/, 'socks5:');
    drop(opts.session.setProxy({ proxyRules: rules }));
    opts.log.info('beacon: proxy enabled for this session');
  }

  opts.session.webRequest.onCompleted(details => {
    let url: URL;
    try {
      url = new URL(details.url);
    } catch {
      return;
    }
    if (!/^(https?|wss?):$/.test(url.protocol) || !url.host) {
      return;
    }
    const { host } = url;
    requestLog.push({
      at: Date.now(),
      host,
      method: details.method,
      resourceType: details.resourceType,
      statusCode: details.statusCode,
      fromCache: details.fromCache,
    });
    if (requestLog.length > MAX_REQUEST_LOG) {
      requestLog.splice(0, requestLog.length - MAX_REQUEST_LOG);
    }
  });

  for (const name of ['lock-screen', 'suspend'] as const) {
    powerMonitor.on(name as 'lock-screen', () => {
      opts.getMainWindow()?.webContents.send('beacon:system', name);
    });
  }

  ipcMain.handle('beacon:invoke', (_event, name: unknown, payload: unknown) => {
    const handler = typeof name === 'string' ? HANDLERS[name] : undefined;
    if (!handler) {
      throw new Error(`beacon:invoke: unknown handler ${String(name)}`);
    }
    return handler(payload);
  });

  opts.log.info('beacon: main process features ready');
}
