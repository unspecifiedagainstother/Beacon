// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Multiple accounts, Telegram style.
 *
 * Signal keeps one account per data folder and opens its database once per
 * process, so every account runs as its own Beacon process with its own
 * window. The main account's process coordinates: it starts the others in
 * the background (so all of them receive messages and notify), owns the
 * single tray icon, and switches between them. Switching shows the target
 * account's window at the current window's position; whenever an account's
 * window appears, all others hide. That also covers clicking a notification
 * from a background account.
 *
 * Processes talk over a local socket (a named pipe on Windows) with
 * newline-separated JSON messages.
 */

import { app } from 'electron';
import type { BrowserWindow, Rectangle } from 'electron';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { join } from 'node:path';

import type { LoggerType } from '../ts/types/Logging.std.ts';
import { drop } from '../ts/util/drop.std.ts';
import {
  MAIN_ACCOUNT_ID,
  getAccountId,
  getAccountsRoot,
  isHiddenStart,
  isMainAccount,
  isValidAccountId,
} from './beacon-account-path.node.ts';

export type BeaconAccountInfo = {
  name?: string;
  subtitle?: string;
  color?: string;
  unread?: number;
  linked?: boolean;
};

export type BeaconAccountListItem = BeaconAccountInfo & {
  id: string;
  isMain: boolean;
  isCurrent: boolean;
  running: boolean;
};

type WindowState = { bounds?: Rectangle; maximized?: boolean };

type Message =
  | { t: 'hello'; id: string }
  | { t: 'info'; info: BeaconAccountInfo }
  | { t: 'shown' }
  | { t: 'closed' }
  | { t: 'req'; rid: number; method: string; params?: unknown }
  | { t: 'res'; rid: number; result?: unknown; error?: string }
  | { t: 'show'; state?: WindowState }
  | { t: 'hide' }
  | { t: 'quit' };

type Options = {
  getMainWindow: () => BrowserWindow | undefined;
  log: LoggerType;
  /** Main account only: whether closing a window keeps Beacon in the tray. */
  isTrayEnabled: () => boolean;
  /** Main account only: refresh the tray after visibility/unread changes. */
  onTrayChange: () => void;
};

let options: Options | undefined;
let quitting = false;

function socketPath(): string {
  const root = getAccountsRoot();
  if (process.platform === 'win32') {
    const hash = createHash('sha256').update(root).digest('hex').slice(0, 16);
    return `\\\\.\\pipe\\beacon-accounts-${hash}`;
  }
  return join(root, 'coordinator.sock');
}

function send(socket: Socket | undefined, message: Message): void {
  if (socket && !socket.destroyed) {
    socket.write(`${JSON.stringify(message)}\n`);
  }
}

function onLines(socket: Socket, handler: (message: Message) => void): void {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          handler(JSON.parse(line) as Message);
        } catch (error) {
          options?.log.warn('beacon accounts: bad message', String(error));
        }
      }
      index = buffer.indexOf('\n');
    }
  });
}

function windowState(): WindowState | undefined {
  const win = options?.getMainWindow();
  if (!win || win.isDestroyed()) {
    return undefined;
  }
  return { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
}

function showOwnWindow(state?: WindowState): void {
  const win = options?.getMainWindow();
  if (!win || win.isDestroyed()) {
    return;
  }
  if (state?.bounds) {
    win.setBounds(state.bounds);
  }
  if (state?.maximized) {
    win.maximize();
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function hideOwnWindow(): void {
  const win = options?.getMainWindow();
  if (win && !win.isDestroyed() && win.isVisible()) {
    win.hide();
  }
}

// ---------------------------------------------------------------------------
// Registry (main account only writes it)
// ---------------------------------------------------------------------------

type Registry = {
  accounts: Array<{ id: string; info?: BeaconAccountInfo }>;
  main?: BeaconAccountInfo;
};

function registryPath(): string {
  return join(getAccountsRoot(), 'accounts.json');
}

function readRegistry(): Registry {
  try {
    const parsed = JSON.parse(
      readFileSync(registryPath(), 'utf8')
    ) as Partial<Registry>;
    return {
      accounts: (parsed.accounts ?? []).filter(a => isValidAccountId(a.id)),
      main: parsed.main,
    };
  } catch {
    return { accounts: [] };
  }
}

let registry: Registry = { accounts: [] };
let saveTimer: NodeJS.Timeout | undefined;

function saveRegistry(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    drop(
      (async () => {
        await mkdir(getAccountsRoot(), { recursive: true });
        await writeFile(registryPath(), JSON.stringify(registry, null, 2));
      })()
    );
  }, 500);
}

// ---------------------------------------------------------------------------
// Coordinator (main account)
// ---------------------------------------------------------------------------

const clients = new Map<string, Socket>();
const visible = new Map<string, boolean>();
const pendingShow = new Map<string, WindowState | undefined>();
const exitWaiters = new Map<string, () => void>();
let currentId = MAIN_ACCOUNT_ID;
let server: Server | undefined;

function setInfo(id: string, info: BeaconAccountInfo): void {
  if (id === MAIN_ACCOUNT_ID) {
    registry.main = info;
  } else {
    const entry = registry.accounts.find(a => a.id === id);
    if (!entry) {
      return;
    }
    entry.info = info;
  }
  saveRegistry();
  options?.onTrayChange();
}

/** Unread messages in the other accounts, for the tray icon. */
export function getOtherAccountsUnread(): number {
  if (!isMainAccount()) {
    return 0;
  }
  return registry.accounts.reduce(
    (sum, account) => sum + (account.info?.unread ?? 0),
    0
  );
}

function spawnArgs(id: string): Array<string> {
  const skip = [
    '--remote-debugging-port',
    '--remote-debugging-address',
    '--beacon-account',
    '--beacon-hidden',
    '--start-in-tray',
  ];
  const args = process.argv
    .slice(1)
    .filter(arg => !skip.some(prefix => arg.startsWith(prefix)));
  // Development aid: give background accounts their own DevTools port.
  const debugBase = Number(process.env.BEACON_ACCOUNT_DEBUG_PORT);
  if (debugBase > 0) {
    const index = registry.accounts.findIndex(a => a.id === id);
    args.unshift(
      `--remote-debugging-port=${debugBase + Math.max(0, index)}`,
      '--remote-debugging-address=127.0.0.1'
    );
  }
  return [...args, `--beacon-account=${id}`, '--beacon-hidden'];
}

function startAccount(id: string): void {
  if (clients.has(id) || exitWaiters.has(id)) {
    return;
  }
  // Packaged AppImages must be relaunched through the AppImage itself.
  const executable = process.env.APPIMAGE ?? process.execPath;
  options?.log.info(`beacon accounts: starting ${id}`);
  const child = spawn(executable, spawnArgs(id), {
    stdio: 'ignore',
    env: process.env,
  });
  exitWaiters.set(id, () => undefined);
  child.on('exit', code => {
    options?.log.info(`beacon accounts: ${id} exited (${code})`);
    const waiter = exitWaiters.get(id);
    exitWaiters.delete(id);
    waiter?.();
  });
  child.on('error', error => {
    options?.log.error(`beacon accounts: ${id} failed to start`, error);
    exitWaiters.delete(id);
  });
}

function showAccount(id: string, state?: WindowState): void {
  if (id === MAIN_ACCOUNT_ID) {
    showOwnWindow(state);
    return;
  }
  const socket = clients.get(id);
  if (socket) {
    send(socket, { t: 'show', state });
    return;
  }
  pendingShow.set(id, state);
  startAccount(id);
}

/** An account's window appeared: it becomes the current one. */
function onShown(id: string): void {
  currentId = id;
  visible.set(id, true);
  for (const [otherId, socket] of clients) {
    if (otherId !== id) {
      send(socket, { t: 'hide' });
    }
  }
  if (id !== MAIN_ACCOUNT_ID) {
    hideOwnWindow();
  }
  options?.onTrayChange();
}

function handleClientMessage(socket: Socket, message: Message): void {
  const id = [...clients].find(([, s]) => s === socket)?.[0];
  if (message.t === 'hello') {
    if (!isValidAccountId(message.id)) {
      socket.destroy();
      return;
    }
    clients.set(message.id, socket);
    if (pendingShow.has(message.id)) {
      send(socket, { t: 'show', state: pendingShow.get(message.id) });
      pendingShow.delete(message.id);
    }
    return;
  }
  if (!id) {
    return;
  }
  switch (message.t) {
    case 'info':
      setInfo(id, message.info);
      break;
    case 'shown':
      onShown(id);
      break;
    case 'closed':
      visible.set(id, false);
      if (!options?.isTrayEnabled()) {
        app.quit();
      }
      options?.onTrayChange();
      break;
    case 'req':
      drop(
        (async () => {
          try {
            const result = await coordinatorRequest(
              id,
              message.method,
              message.params
            );
            send(socket, { t: 'res', rid: message.rid, result });
          } catch (error) {
            send(socket, {
              t: 'res',
              rid: message.rid,
              error: String(error),
            });
          }
        })()
      );
      break;
    default:
      break;
  }
}

async function coordinatorRequest(
  fromId: string,
  method: string,
  params: unknown
): Promise<unknown> {
  const { target, state } = (params ?? {}) as {
    target?: string;
    state?: WindowState;
  };
  switch (method) {
    case 'list':
      return listAccounts(fromId);
    case 'switch':
      if (
        target === MAIN_ACCOUNT_ID ||
        registry.accounts.some(a => a.id === target)
      ) {
        showAccount(String(target), state);
        return true;
      }
      return false;
    case 'add': {
      const id = randomBytes(5).toString('hex');
      registry.accounts.push({ id });
      saveRegistry();
      showAccount(id, state);
      return id;
    }
    case 'remove':
      return removeAccount(String(target), state);
    case 'quitAll':
      app.quit();
      return true;
    default:
      throw new Error(`unknown method ${method}`);
  }
}

function listAccounts(currentFor: string): Array<BeaconAccountListItem> {
  return [
    {
      ...registry.main,
      id: MAIN_ACCOUNT_ID,
      isMain: true,
      isCurrent: currentFor === MAIN_ACCOUNT_ID,
      running: true,
    },
    ...registry.accounts.map(account => ({
      ...account.info,
      id: account.id,
      isMain: false,
      isCurrent: currentFor === account.id,
      running: clients.has(account.id),
    })),
  ];
}

async function removeAccount(
  id: string,
  state: WindowState | undefined
): Promise<boolean> {
  if (id === MAIN_ACCOUNT_ID || !registry.accounts.some(a => a.id === id)) {
    return false;
  }
  if (currentId === id) {
    showAccount(MAIN_ACCOUNT_ID, state);
  }
  const socket = clients.get(id);
  if (socket || exitWaiters.has(id)) {
    const exited = new Promise<void>(resolve => {
      if (exitWaiters.has(id)) {
        exitWaiters.set(id, resolve);
      } else {
        // Left running by an earlier session: no child handle, so wait for
        // its connection to drop and give it a moment to release files.
        socket?.once('close', () => setTimeout(resolve, 1500));
      }
      setTimeout(resolve, 15_000);
    });
    send(socket, { t: 'quit' });
    await exited;
  }
  registry.accounts = registry.accounts.filter(a => a.id !== id);
  saveRegistry();
  await rm(join(getAccountsRoot(), id), { recursive: true, force: true });
  options?.log.info(`beacon accounts: removed ${id}`);
  options?.onTrayChange();
  return true;
}

function startCoordinator(): void {
  registry = readRegistry();
  const path = socketPath();
  if (process.platform !== 'win32' && existsSync(path)) {
    // Left over from a crash; we hold the single-instance lock, so it's ours.
    unlinkSync(path);
  }
  server = createServer(socket => {
    onLines(socket, message => handleClientMessage(socket, message));
    socket.on('close', () => {
      for (const [id, s] of clients) {
        if (s === socket) {
          clients.delete(id);
          visible.delete(id);
          if (currentId === id) {
            currentId = MAIN_ACCOUNT_ID;
          }
        }
      }
      options?.onTrayChange();
    });
    socket.on('error', () => undefined);
  });
  drop(
    (async () => {
      await mkdir(getAccountsRoot(), { recursive: true });
      server?.listen(path);
    })()
  );

  // Give background accounts left running by a previous session a moment
  // to reconnect before starting the missing ones.
  setTimeout(() => {
    for (const { id } of registry.accounts) {
      startAccount(id);
    }
  }, 3000);

  app.on('before-quit', () => {
    quitting = true;
    for (const socket of clients.values()) {
      send(socket, { t: 'quit' });
    }
  });
  app.on('will-quit', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      try {
        writeFileSync(registryPath(), JSON.stringify(registry, null, 2));
      } catch {
        // Ignore
      }
    }
    server?.close();
    if (process.platform !== 'win32') {
      try {
        rmSync(path, { force: true });
      } catch {
        // Ignore
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Client (extra accounts)
// ---------------------------------------------------------------------------

let coordinator: Socket | undefined;
let nextRid = 1;
const pendingRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
let lastInfo: BeaconAccountInfo | undefined;
let orphanTimer: NodeJS.Timeout | undefined;

function connectToCoordinator(): void {
  const socket = createConnection(socketPath());
  socket.on('connect', () => {
    coordinator = socket;
    clearTimeout(orphanTimer);
    send(socket, { t: 'hello', id: getAccountId() });
    if (lastInfo) {
      send(socket, { t: 'info', info: lastInfo });
    }
    if (options?.getMainWindow()?.isVisible()) {
      send(socket, { t: 'shown' });
    }
  });
  onLines(socket, message => {
    switch (message.t) {
      case 'show':
        showOwnWindow(message.state);
        break;
      case 'hide':
        hideOwnWindow();
        break;
      case 'quit':
        quitting = true;
        app.quit();
        break;
      case 'res': {
        const pending = pendingRequests.get(message.rid);
        pendingRequests.delete(message.rid);
        if (message.error) {
          pending?.reject(new Error(message.error));
        } else {
          pending?.resolve(message.result);
        }
        break;
      }
      default:
        break;
    }
  });
  socket.on('error', () => undefined);
  socket.on('close', () => {
    coordinator = undefined;
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error('Main account is not running'));
    }
    pendingRequests.clear();
    if (quitting) {
      return;
    }
    // The main account quit or crashed: a hidden background account has no
    // way to be reached, so it goes too (after a grace period for restarts).
    clearTimeout(orphanTimer);
    orphanTimer = setTimeout(() => {
      if (!coordinator && !options?.getMainWindow()?.isVisible()) {
        options?.log.info('beacon accounts: main account gone, quitting');
        quitting = true;
        app.quit();
      }
    }, 20_000);
    setTimeout(connectToCoordinator, 2000);
  });
}

function clientRequest(method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!coordinator) {
      reject(new Error('Main account is not running'));
      return;
    }
    const rid = nextRid;
    nextRid += 1;
    pendingRequests.set(rid, { resolve, reject });
    send(coordinator, { t: 'req', rid, method, params });
  });
}

function startClient(): void {
  connectToCoordinator();
  app.on('before-quit', () => {
    if (!quitting && coordinator) {
      // Quit from this window's menu: quit every account.
      send(coordinator, { t: 'req', rid: 0, method: 'quitAll' });
    }
    quitting = true;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setupBeaconAccounts(opts: Options): void {
  options = opts;
  if (isMainAccount()) {
    startCoordinator();
  } else {
    startClient();
  }
}

/** Call once the main window exists, to track when it appears. */
export function watchBeaconAccountWindow(win: BrowserWindow): void {
  win.on('show', () => {
    if (isMainAccount()) {
      onShown(MAIN_ACCOUNT_ID);
    } else {
      send(coordinator, { t: 'shown' });
    }
  });
  win.on('hide', () => {
    if (isMainAccount()) {
      visible.set(MAIN_ACCOUNT_ID, false);
      options?.onTrayChange();
    }
  });
}

/** Extra accounts never get their own tray icon; the main account's is shared. */
export function isBeaconTrayAllowed(): boolean {
  return isMainAccount();
}

/**
 * Extra accounts hide on close instead of quitting; the main account
 * decides (it quits everything when the tray is off).
 */
export function beaconHideOnClose(): boolean {
  if (isMainAccount() || !coordinator) {
    return false;
  }
  send(coordinator, { t: 'closed' });
  return true;
}

/** Main account: is any account's window visible (for the tray menu)? */
export function isAnyAccountVisible(): boolean {
  if (currentId !== MAIN_ACCOUNT_ID) {
    return visible.get(currentId) === true;
  }
  return options?.getMainWindow()?.isVisible() === true;
}

/**
 * Main account: show the current account (tray click, launching Beacon
 * again). Returns false when that is this process's own window.
 */
export function showCurrentAccount(): boolean {
  if (!isMainAccount() || currentId === MAIN_ACCOUNT_ID) {
    return false;
  }
  if (!clients.has(currentId)) {
    currentId = MAIN_ACCOUNT_ID;
    return false;
  }
  showAccount(currentId);
  return true;
}

/** Main account: hide whichever account is current (tray). */
export function hideCurrentAccount(): boolean {
  if (!isMainAccount() || currentId === MAIN_ACCOUNT_ID) {
    return false;
  }
  send(clients.get(currentId), { t: 'hide' });
  visible.set(currentId, false);
  return true;
}

export { isHiddenStart };

// Renderer API (via beacon.main.ts HANDLERS)

export async function accountsRequest(
  method: 'list' | 'switch' | 'add' | 'remove',
  target?: string
): Promise<unknown> {
  const params = { target, state: windowState() };
  if (isMainAccount()) {
    return coordinatorRequest(MAIN_ACCOUNT_ID, method, params);
  }
  return clientRequest(method, params);
}

export function reportAccountInfo(info: BeaconAccountInfo): void {
  lastInfo = info;
  if (isMainAccount()) {
    setInfo(MAIN_ACCOUNT_ID, info);
  } else {
    send(coordinator, { t: 'info', info });
  }
}
