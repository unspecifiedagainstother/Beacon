// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';

export const MAIN_ACCOUNT_ID = 'main';
const ACCOUNT_ID = /^[a-z0-9]{4,32}$/;

let accountsRoot: string | undefined;
let accountId = MAIN_ACCOUNT_ID;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

export function isValidAccountId(id: string): boolean {
  return ACCOUNT_ID.test(id);
}

export function resolveBeaconAccountDir(
  defaultUserData: string
): string | undefined {
  accountsRoot = `${defaultUserData}-accounts`;
  const requested = argValue('beacon-account');
  if (!requested || !isValidAccountId(requested)) {
    return undefined;
  }
  accountId = requested;
  return join(accountsRoot, requested);
}

export function getAccountsRoot(): string {
  if (!accountsRoot) {
    throw new Error('beacon accounts: root not resolved yet');
  }
  return accountsRoot;
}

export function getAccountId(): string {
  return accountId;
}

export function isMainAccount(): boolean {
  return accountId === MAIN_ACCOUNT_ID;
}

export function isHiddenStart(): boolean {
  return process.argv.includes('--beacon-hidden');
}
