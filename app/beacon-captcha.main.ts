// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

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
      partition: 'beacon-captcha',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  current = win;

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

export function closeCaptchaWindow(): void {
  if (current && !current.isDestroyed()) {
    current.close();
  }
  current = undefined;
}
