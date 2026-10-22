// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * App lock: a passphrase screen over the whole window, on start and after
 * inactivity, plus an optional duress passphrase.
 *
 * Storage: two "slots" in localStorage, each an AES-GCM blob under a key
 * derived from a passphrase (PBKDF2-SHA256, 600k). One slot opens with the
 * real passphrase, the other with the duress passphrase — or holds random
 * bytes when no duress passphrase is set. Slots are stored in random order
 * and look the same, so the file doesn't reveal whether a duress passphrase
 * exists or what it does.
 *
 * This is a lock on the interface. It does not re-encrypt Signal's database
 * (that key is protected by the OS keychain), so someone with full access
 * to your user account and files can still get at the data.
 */

import { createLogger } from '../../logging/log.std.ts';
import { createElement } from './ui.dom.ts';
import { drop } from '../../util/drop.std.ts';

const log = createLogger('beacon/lock');

const STORAGE_KEY = 'beacon-lock';
const ITERATIONS = 600_000;

export type DuressAction = 'decoy' | 'wipe';

type SlotPayload = { kind: 'real' } | { kind: 'duress'; action: DuressAction };

type Slot = { salt: string; iv: string; data: string };
type LockConfig = { version: 1; iterations: number; slots: [Slot, Slot] };

export type UnlockResult =
  | { kind: 'real' }
  | { kind: 'duress'; action: DuressAction }
  | { kind: 'wrong' };

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

const b64 = (bytes: Uint8Array<ArrayBuffer>) => {
  let s = '';
  for (const byte of bytes) {
    s += String.fromCharCode(byte);
  }
  return btoa(s);
};
const unb64 = (text: string): Uint8Array<ArrayBuffer> => {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    out[i] = s.charCodeAt(i);
  }
  return out;
};

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Fixed-size plaintext so real and duress slots have the same length.
const PAYLOAD_SIZE = 64;

function pad(json: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(PAYLOAD_SIZE).fill(0x20);
  out.set(new TextEncoder().encode(json).subarray(0, PAYLOAD_SIZE));
  return out;
}

async function sealSlot(
  passphrase: string,
  payload: SlotPayload,
  iterations: number
): Promise<Slot> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      pad(JSON.stringify(payload))
    )
  );
  return { salt: b64(salt), iv: b64(iv), data: b64(data) };
}

function randomSlot(): Slot {
  return {
    salt: b64(crypto.getRandomValues(new Uint8Array(16))),
    iv: b64(crypto.getRandomValues(new Uint8Array(12))),
    data: b64(crypto.getRandomValues(new Uint8Array(PAYLOAD_SIZE + 16))),
  };
}

async function openSlot(
  passphrase: string,
  slot: Slot,
  iterations: number
): Promise<SlotPayload | undefined> {
  try {
    const key = await deriveKey(passphrase, unb64(slot.salt), iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(slot.iv) },
      key,
      unb64(slot.data)
    );
    return JSON.parse(new TextDecoder().decode(plain).trim()) as SlotPayload;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function readConfig(): LockConfig | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as LockConfig) : undefined;
    return parsed?.version === 1 && parsed.slots?.length === 2
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function writeConfig(config: LockConfig | undefined): void {
  if (config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function shuffled(a: Slot, b: Slot): [Slot, Slot] {
  const [coin = 0] = crypto.getRandomValues(new Uint8Array(1));
  return coin % 2 ? [a, b] : [b, a];
}

export function isLockConfigured(): boolean {
  return readConfig() !== undefined;
}

export async function verifyPassphrase(
  passphrase: string
): Promise<UnlockResult> {
  const config = readConfig();
  if (!config) {
    return { kind: 'real' };
  }
  const results = await Promise.all(
    config.slots.map(slot => openSlot(passphrase, slot, config.iterations))
  );
  const hit = results.find(r => r != null);
  if (hit?.kind === 'real') {
    return { kind: 'real' };
  }
  if (hit?.kind === 'duress') {
    return { kind: 'duress', action: hit.action };
  }
  return { kind: 'wrong' };
}

/** Finds which slot index the given passphrase opens. */
async function slotIndexFor(
  config: LockConfig,
  passphrase: string
): Promise<{ index: number; payload: SlotPayload } | undefined> {
  const results = await Promise.all(
    config.slots.map(slot => openSlot(passphrase, slot, config.iterations))
  );
  const index = results.findIndex(r => r != null);
  const payload = results[index];
  return payload ? { index, payload } : undefined;
}

/** Set (no current passphrase) or change (current must be the real one). */
export async function setPassphrase(
  next: string,
  current?: string
): Promise<boolean> {
  const config = readConfig();
  if (!config) {
    const real = await sealSlot(next, { kind: 'real' }, ITERATIONS);
    writeConfig({
      version: 1,
      iterations: ITERATIONS,
      slots: shuffled(real, randomSlot()),
    });
    notify();
    return true;
  }
  const found = current ? await slotIndexFor(config, current) : undefined;
  if (found?.payload.kind !== 'real') {
    return false;
  }
  const other = found.index === 0 ? config.slots[1] : config.slots[0];
  const real = await sealSlot(next, { kind: 'real' }, config.iterations);
  writeConfig({ ...config, slots: shuffled(real, other) });
  return true;
}

export async function removePassphrase(current: string): Promise<boolean> {
  const config = readConfig();
  if (!config) {
    return true;
  }
  const found = await slotIndexFor(config, current);
  if (found?.payload.kind !== 'real') {
    return false;
  }
  writeConfig(undefined);
  notify();
  return true;
}

/** Sets or clears (duress = undefined) the duress passphrase. */
export async function setDuress(
  real: string,
  duress: { passphrase: string; action: DuressAction } | undefined
): Promise<'ok' | 'wrong' | 'same'> {
  const config = readConfig();
  if (!config) {
    return 'wrong';
  }
  const found = await slotIndexFor(config, real);
  if (found?.payload.kind !== 'real') {
    return 'wrong';
  }
  if (duress && duress.passphrase === real) {
    return 'same';
  }
  const realSlot = found.index === 0 ? config.slots[0] : config.slots[1];
  const duressSlot = duress
    ? await sealSlot(
        duress.passphrase,
        { kind: 'duress', action: duress.action },
        config.iterations
      )
    : randomSlot();
  writeConfig({ ...config, slots: shuffled(realSlot, duressSlot) });
  return 'ok';
}

// ---------------------------------------------------------------------------
// Lock state and overlay
// ---------------------------------------------------------------------------

type LockListener = (event: 'locked' | 'unlocked' | 'config') => void;
const listeners = new Set<LockListener>();
let locked = false;
let overlay: HTMLElement | undefined;
let inerted: Array<HTMLElement> = [];
let bodyObserver: MutationObserver | undefined;
let unlockHandler: ((result: UnlockResult) => void) | undefined;
let pendingResult: UnlockResult | undefined;
// Once unlocked with the duress passphrase, stays set until restart.
let duressSession = false;

function notify(event: 'locked' | 'unlocked' | 'config' = 'config'): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch (error) {
      log.error('lock listener threw', error);
    }
  }
}

export function onLockChange(listener: LockListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isLocked(): boolean {
  return locked;
}

/** True after unlocking with the duress passphrase (until restart). */
export function isDuressSession(): boolean {
  return duressSession;
}

/** Called once by the app-lock built-in to handle duress results. */
export function setUnlockHandler(
  handler: ((result: UnlockResult) => void) | undefined
): void {
  unlockHandler = handler;
  // The startup lock can be answered before the built-in has started.
  if (handler && pendingResult) {
    const result = pendingResult;
    pendingResult = undefined;
    handler(result);
  }
}

function inertOthers(): void {
  // Everything except the overlay and the custom titlebar. The titlebar is
  // nested in the app root, so walk down its ancestor chain and inert the
  // siblings at each level instead of the ancestors themselves.
  const titlebar = document.querySelector('.BeaconTitlebar');
  if (titlebar) {
    // A startup lock runs before the titlebar exists and may have inerted
    // its ancestor; release that one and inert at a finer level below.
    const keep: Array<HTMLElement> = [];
    for (const element of inerted) {
      if (element.contains(titlebar)) {
        element.inert = false;
      } else {
        keep.push(element);
      }
    }
    inerted = keep;
  }
  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement) || child === overlay) {
        continue;
      }
      if (titlebar && child.contains(titlebar)) {
        if (child !== titlebar) {
          visit(child);
        }
        continue;
      }
      if (!child.inert) {
        child.inert = true;
        inerted.push(child);
      }
    }
  };
  visit(document.body);
}

let inertScheduled = false;
function scheduleInert(): void {
  if (inertScheduled) {
    return;
  }
  inertScheduled = true;
  requestAnimationFrame(() => {
    inertScheduled = false;
    if (locked) {
      inertOthers();
    }
  });
}

function buildOverlay(): HTMLElement {
  const input = createElement({
    tag: 'input',
    className: 'BeaconLock__input',
    attrs: {
      type: 'password',
      placeholder: 'Passphrase',
      autocomplete: 'current-password',
      spellcheck: 'false',
      'aria-label': 'Passphrase',
    },
  }) as HTMLInputElement;
  const error = createElement({
    tag: 'p',
    className: 'BeaconLock__error',
    attrs: { role: 'alert' },
  });
  const button = createElement({
    tag: 'button',
    className: 'BeaconButton BeaconButton--primary BeaconLock__button',
    text: 'Unlock',
    attrs: { type: 'submit' },
  }) as HTMLButtonElement;

  const form = createElement({
    tag: 'form',
    className: 'BeaconLock__card',
    children: [
      createElement({ tag: 'div', className: 'BeaconLock__icon' }),
      createElement({
        tag: 'h1',
        className: 'BeaconLock__title',
        text: 'Beacon is locked',
      }),
      input,
      error,
      button,
    ],
  });

  let failures = 0;
  let busy = false;
  let blockedUntil = 0;

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (busy) {
      return;
    }
    const wait = blockedUntil - Date.now();
    if (wait > 0) {
      error.textContent = `Too many attempts. Try again in ${Math.ceil(wait / 1000)} s.`;
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'Checking…';
    const result = await verifyPassphrase(input.value);
    busy = false;
    button.disabled = false;
    button.textContent = 'Unlock';
    if (result.kind === 'wrong') {
      failures += 1;
      input.value = '';
      if (failures >= 5) {
        // 30 s, 60 s, 120 s, ... capped at 15 min.
        const seconds = Math.min(900, 30 * 2 ** (failures - 5));
        blockedUntil = Date.now() + seconds * 1000;
        error.textContent = `Wrong passphrase. Locked for ${seconds} s.`;
      } else {
        error.textContent = 'Wrong passphrase.';
      }
      return;
    }
    input.value = '';
    error.textContent = '';
    failures = 0;
    unlock(result);
  });

  // Keep keystrokes from reaching Signal's global shortcuts underneath.
  const stop = (ev: Event) => ev.stopPropagation();
  form.addEventListener('keydown', stop);
  form.addEventListener('keyup', stop);

  const root = createElement({
    tag: 'div',
    className: 'BeaconLock',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Locked' },
    children: [form],
  });

  // The custom titlebar ends up under the lock; keep the window usable.
  const addControls = async () => {
    if (!(await window.IPC.beaconGetCustomTitlebar())) {
      return;
    }
    const control = (label: string, glyph: string, onClick: () => void) =>
      createElement({
        tag: 'button',
        className: 'BeaconLock__control',
        text: glyph,
        attrs: { type: 'button', 'aria-label': label },
        onClick,
      });
    root.appendChild(
      createElement({
        tag: 'div',
        className: 'BeaconLock__controls',
        children: [
          control('Minimize', '\u2013', () =>
            window.IPC.beaconWindowMinimize()
          ),
          control('Maximize', '\u25a2', () =>
            window.IPC.beaconWindowToggleMaximize()
          ),
          control('Close', '\u2715', () => window.IPC.beaconWindowClose()),
        ],
      })
    );
  };
  drop(addControls());
  return root;
}

export function lock(): void {
  if (!isLockConfigured()) {
    return;
  }
  if (locked) {
    return;
  }
  locked = true;
  const mount = () => {
    overlay = buildOverlay();
    document.body.appendChild(overlay);
    inertOthers();
    // Subtree: the app renders (and the titlebar appears) after a startup lock.
    bodyObserver = new MutationObserver(scheduleInert);
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    overlay.querySelector('input')?.focus();
  };
  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
  notify('locked');
}

function unlock(result: UnlockResult): void {
  if (result.kind === 'duress') {
    duressSession = true;
  }
  locked = false;
  bodyObserver?.disconnect();
  bodyObserver = undefined;
  overlay?.remove();
  overlay = undefined;
  for (const el of inerted) {
    el.inert = false;
  }
  inerted = [];
  notify('unlocked');
  if (unlockHandler) {
    unlockHandler(result);
  } else {
    pendingResult = result;
  }
}

/** Lock right away at startup when a passphrase is configured. */
export function lockOnStartup(): void {
  if (isLockConfigured()) {
    lock();
  }
}
