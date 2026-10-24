// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * In-app captcha window for registration and rate-limit challenges.
 *
 * Upstream opens signalcaptchas.org in the system browser and waits for the
 * OS to hand the resulting `signalcaptcha://` link back to the app. That
 * needs the protocol handler registered, which often isn't the case on
 * Linux (AppImage, Flatpak, distrobox, dev builds). Here the same official
 * page — the one carrying Signal's hCaptcha site key — loads in a small
 * window, and the `signalcaptcha://…` navigation it ends with is caught
 * directly (as signal-cli users do by copying that link by hand).
 *
 * The hCaptcha widget only works on the domain its site key is registered
 * for, so the page has to come from signalcaptchas.org; it can't be embedded
 * in Beacon's own UI. The window uses a throwaway in-memory session (no
 * cookies kept) and may only navigate to the captcha and hCaptcha hosts.
 */

import { BrowserWindow } from 'electron';
import type { LoggerType } from '../ts/types/Logging.std.ts';
import { drop } from '../ts/util/drop.std.ts';

const ALLOWED_HOSTS = [/^signalcaptchas\.org$/, /(^|\.)hcaptcha\.com$/];
const CAPTCHA_SCHEME = 'signalcaptcha:';

let current: BrowserWindow | undefined;

function isAllowed(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      ALLOWED_HOSTS.some(pattern => pattern.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** `signalcaptcha://signal-hcaptcha.<key>.registration.<token>` → token. */
export function captchaTokenFromUrl(rawUrl: string): string | undefined {
  if (!rawUrl.toLowerCase().startsWith(`${CAPTCHA_SCHEME}//`)) {
    return undefined;
  }
  const token = rawUrl.slice(CAPTCHA_SCHEME.length + 2).replace(/\/+$/, '');
  return token || undefined;
}

export function openCaptchaWindow({
  parent,
  url,
  onToken,
  log,
}: {
  parent: BrowserWindow | undefined;
  url: string;
  onToken: (token: string) => void;
  log: LoggerType;
}): void {
  if (current && !current.isDestroyed()) {
    current.focus();
    return;
  }

  const win = new BrowserWindow({
    parent,
    modal: Boolean(parent),
    width: 440,
    height: 680,
    minWidth: 360,
    minHeight: 520,
    title: 'Verify you’re human',
    backgroundColor: '#1f1f1f',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // No "persist:" prefix: in-memory, discarded with the window.
      partition: 'beacon-captcha',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  current = win;

  // hCaptcha scores the browser; an "Electron/…" or app token in the user
  // agent reads as automation and Signal then rejects the solved captcha.
  // Present as the plain Chromium this is.
  win.webContents.setUserAgent(
    win.webContents
      .getUserAgent()
      .replace(/\s(?:Electron|[\w-]*(?:signal|beacon)[\w-]*)\/\S+/gi, '')
  );

  let done = false;
  const handle = (event: { preventDefault: () => void }, target: string) => {
    const token = captchaTokenFromUrl(target);
    if (token) {
      event.preventDefault();
      if (!done) {
        done = true;
        // The first parts name the captcha type and site key; not secret.
        log.info(
          `beacon captcha: token received (${token
            .split('.')
            .slice(0, 3)
            .join('.')}…, ${token.length} chars)`
        );
        onToken(token);
        win.close();
      }
      return;
    }
    if (!isAllowed(target)) {
      log.warn('beacon captcha: blocked navigation off the captcha page');
      event.preventDefault();
    }
  };

  win.webContents.on('will-navigate', (event, target) => handle(event, target));
  win.webContents.on('will-redirect', (event, target) => handle(event, target));
  win.webContents.on('will-frame-navigate', event => {
    if (!event.isMainFrame) {
      // hCaptcha's own iframes.
      if (!isAllowed(event.url) && !captchaTokenFromUrl(event.url)) {
        event.preventDefault();
      }
      return;
    }
    handle(event, event.url);
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    const token = captchaTokenFromUrl(target);
    if (token && !done) {
      done = true;
      onToken(token);
      win.close();
    }
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (current === win) {
      current = undefined;
    }
  });

  log.info('beacon captcha: opening in-app captcha window');
  drop(win.loadURL(url));
}

/** Close the in-app captcha window (switching to the system browser). */
export function closeCaptchaWindow(): void {
  if (current && !current.isDestroyed()) {
    current.close();
  }
  current = undefined;
}
