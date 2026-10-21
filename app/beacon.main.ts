// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Beacon main-process features, behind one IPC bridge.
 *
 * The renderer calls `window.IPC.beaconInvoke(name, payload)`; only the names
 * in HANDLERS are accepted. Settings that must apply before the renderer
 * loads (content protection, spellcheck downloads) are persisted in
 * ephemeralConfig, like the custom titlebar.
 *
 * Wiring in main.main.ts is two calls: setupBeaconMain() once the default
 * session exists, and applyBeaconWindowSettings() after the main window is
 * created.
 */

import type { BrowserWindow, Session } from 'electron';
import { ipcMain } from 'electron';
import * as ephemeralConfig from './ephemeral_config.main.ts';
import type { LoggerType } from '../ts/types/Logging.std.ts';

const CONTENT_PROTECTION_KEY = 'beacon-content-protection';
const BLOCK_SPELLCHECK_KEY = 'beacon-block-spellcheck-download';

// Nothing listens here; Chromium's download simply fails and only
// dictionaries already on disk are used.
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

export function applyBeaconWindowSettings(window: BrowserWindow): void {
  // Excludes the window from screenshots and screen sharing on Windows and
  // macOS. Most Linux compositors ignore it.
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

  'network:log': () => requestLog.slice(),

  'network:clear': () => {
    requestLog.length = 0;
    return true;
  },
};

export function setupBeaconMain(opts: Options): void {
  options = opts;
  applySpellcheckBlock(opts.session);

  // Chromium-level requests made by this session (images, link previews
  // loaded in the page, devtools, ...). Connections opened by Node code or
  // by libsignal's native networking are recorded on the renderer side.
  opts.session.webRequest.onCompleted(details => {
    let url: URL;
    try {
      url = new URL(details.url);
    } catch {
      return;
    }
    // Network only: skip file:, data:, devtools:, attachment: and friends.
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

  ipcMain.handle('beacon:invoke', (_event, name: unknown, payload: unknown) => {
    const handler = typeof name === 'string' ? HANDLERS[name] : undefined;
    if (!handler) {
      throw new Error(`beacon:invoke: unknown handler ${String(name)}`);
    }
    return handler(payload);
  });

  opts.log.info('beacon: main process features ready');
}
