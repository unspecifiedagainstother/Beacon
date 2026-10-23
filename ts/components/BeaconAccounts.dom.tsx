// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import classNames from 'classnames';

import { AxoSymbol } from '../axo/AxoSymbol.dom.tsx';
import { AvatarColorMap } from '../types/Colors.std.ts';
import { getInitials } from '../util/getInitials.std.ts';
import { askConfirm } from '../beacon/core/prompts.dom.ts';
import { showNotification } from '../beacon/core/ui.dom.ts';
import { drop } from '../util/drop.std.ts';

/**
 * Account list for the menu drawer, Telegram style: every account signed
 * in on this computer, with its unread count. Click one to switch to it,
 * right-click to remove it, or add another.
 */

export type BeaconAccountRow = {
  id: string;
  isMain: boolean;
  isCurrent: boolean;
  running: boolean;
  name?: string;
  subtitle?: string;
  color?: string;
  unread?: number;
};

const EXPANDED_KEY = 'beacon-accounts-expanded';

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function useAccountsExpanded(): [boolean, () => void] {
  const [expanded, setExpanded] = useState(readExpanded);
  const toggle = () =>
    setExpanded(value => {
      try {
        localStorage.setItem(EXPANDED_KEY, value ? '0' : '1');
      } catch {
        // Ignore
      }
      return !value;
    });
  return [expanded, toggle];
}

async function fetchAccounts(): Promise<Array<BeaconAccountRow>> {
  try {
    return (await window.IPC.beaconInvoke(
      'accounts:list'
    )) as Array<BeaconAccountRow>;
  } catch {
    return [];
  }
}

export function AccountAvatar({
  name,
  color,
}: {
  name: string | undefined;
  color: string | undefined;
}): JSX.Element {
  const colors = color
    ? AvatarColorMap.get(color as Parameters<typeof AvatarColorMap.get>[0])
    : undefined;
  const initials = getInitials(name);
  return (
    <span
      className="BeaconAccounts__avatar"
      style={colors ? { background: colors.bg, color: colors.fg } : undefined}
    >
      {initials ?? <AxoSymbol.Icon size={16} symbol="person" label={null} />}
    </span>
  );
}

async function removeAccount(account: BeaconAccountRow): Promise<boolean> {
  const sure = await askConfirm({
    title: `Remove ${account.name ?? 'this account'}?`,
    body: 'All of its messages, attachments and settings are deleted from this computer. Your phone keeps them, but this computer stays listed under Linked devices until you remove it there.',
    confirmLabel: 'Remove',
    destructive: true,
  });
  if (!sure) {
    return false;
  }
  try {
    const ok = (await window.IPC.beaconInvoke(
      'accounts:remove',
      account.id
    )) as boolean;
    showNotification(
      ok ? 'Account removed' : 'Couldn’t remove it',
      ok ? 'success' : 'error'
    );
    return ok;
  } catch (error) {
    showNotification(String(error), 'error');
    return false;
  }
}

export function BeaconAccountList({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [accounts, setAccounts] = useState<Array<BeaconAccountRow>>([]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      const next = await fetchAccounts();
      if (!cancelled) {
        setAccounts(next);
      }
    };
    drop(load());
    const timer = setInterval(() => drop(load()), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open]);

  const switchTo = (account: BeaconAccountRow) => {
    onClose();
    if (account.isCurrent) {
      return;
    }
    drop(
      (async () => {
        try {
          await window.IPC.beaconInvoke('accounts:switch', account.id);
        } catch (error) {
          showNotification(String(error), 'error');
        }
      })()
    );
  };

  const add = () => {
    onClose();
    drop(
      (async () => {
        try {
          await window.IPC.beaconInvoke('accounts:add');
          showNotification('Opening a new account…');
        } catch (error) {
          showNotification(String(error), 'error');
        }
      })()
    );
  };

  return (
    <div className="BeaconAccounts">
      {accounts.map(account => (
        <button
          key={account.id}
          type="button"
          className={classNames('BeaconAccounts__row', {
            'BeaconAccounts__row--current': account.isCurrent,
          })}
          title={
            account.isMain ? undefined : 'Right-click to remove this account'
          }
          onClick={() => switchTo(account)}
          onContextMenu={event => {
            if (account.isMain || account.isCurrent) {
              return;
            }
            event.preventDefault();
            onClose();
            drop(removeAccount(account));
          }}
        >
          <AccountAvatar name={account.name} color={account.color} />
          <span className="BeaconAccounts__text">
            <span className="BeaconAccounts__name">
              {account.name ?? 'Not signed in'}
            </span>
            {account.subtitle ? (
              <span className="BeaconAccounts__sub Beacon-pii">
                {account.subtitle}
              </span>
            ) : null}
          </span>
          {account.isCurrent ? (
            <span className="BeaconAccounts__check">
              <AxoSymbol.Icon size={16} symbol="check" label="Current" />
            </span>
          ) : null}
          {!account.isCurrent && (account.unread ?? 0) > 0 ? (
            <span className="BeaconNavDrawer__badge">
              {(account.unread ?? 0) > 99 ? '99+' : account.unread}
            </span>
          ) : null}
        </button>
      ))}
      <button
        type="button"
        className="BeaconNavDrawer__item BeaconAccounts__add"
        onClick={add}
      >
        <AxoSymbol.Icon size={20} symbol="plus" label={null} />
        <span className="BeaconNavDrawer__label">Add account</span>
      </button>
    </div>
  );
}
