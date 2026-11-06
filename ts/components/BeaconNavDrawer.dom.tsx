// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX, ReactNode } from 'react';
import { createContext, useEffect, useRef } from 'react';
import classNames from 'classnames';

import type { LocalizerType } from '../types/Util.std.ts';
import type { ConversationType } from '../state/ducks/conversations.preload.ts';
import type { ThemeType } from '../types/Util.std.ts';
import { NavTab, ProfileEditorPage, SettingsPage } from '../types/Nav.std.ts';
import type { Location } from '../types/Nav.std.ts';
import { AxoSymbol } from '../axo/AxoSymbol.dom.tsx';
import { Avatar, AvatarSize } from './Avatar.dom.tsx';
import { isLockConfigured, lock } from '../beacon/core/lock.dom.ts';
import {
  BeaconAccountList,
  useAccountsExpanded,
} from './BeaconAccounts.dom.tsx';

export const BeaconNavDrawerContext = createContext<(() => void) | null>(null);

export type BeaconNavDrawerExtras = Readonly<{
  me: ConversationType;
  theme: ThemeType;
  onToggleTheme: () => void;
  onNavigate: (location: Location) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onOpenNoteToSelf: () => void;
  onOpenArchived: () => void;
}>;

type Props = BeaconNavDrawerExtras &
  Readonly<{
    i18n: LocalizerType;
    open: boolean;
    onClose: () => void;
    selectedNavTab: NavTab;
    storiesEnabled: boolean;
    hasPendingUpdate: boolean;
    hasFailedStorySends: boolean;
    unreadChatsCount: number;
    unreadCallsCount: number;
    unreadStoriesCount: number;
  }>;

function Badge({ count }: { count: number }): JSX.Element | null {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="BeaconNavDrawer__badge">{count > 99 ? '99+' : count}</span>
  );
}

function Item({
  symbol,
  label,
  active,
  trailing,
  onSelect,
}: {
  symbol: AxoSymbol.Name;
  label: string;
  active?: boolean;
  trailing?: ReactNode;
  onSelect: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={classNames('BeaconNavDrawer__item', {
        'BeaconNavDrawer__item--active': active,
      })}
      aria-current={active ? 'page' : undefined}
      onClick={onSelect}
    >
      <AxoSymbol.Icon size={20} symbol={symbol} label={null} />
      <span className="BeaconNavDrawer__label">{label}</span>
      {trailing}
    </button>
  );
}

export function BeaconNavDrawer({
  i18n,
  open,
  onClose,
  selectedNavTab,
  storiesEnabled,
  hasPendingUpdate,
  hasFailedStorySends,
  unreadChatsCount,
  unreadCallsCount,
  unreadStoriesCount,
  me,
  theme,
  onToggleTheme,
  onNavigate,
  onNewChat,
  onNewGroup,
  onOpenNoteToSelf,
  onOpenArchived,
}: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const [accountsExpanded, toggleAccounts] = useAccountsExpanded();

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previous = document.activeElement;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [open, onClose]);

  const go = (action: () => void) => () => {
    onClose();
    action();
  };
  const settings = (
    page:
      | SettingsPage.Profile
      | SettingsPage.General
      | SettingsPage.Beacon
      | SettingsPage.BeaconPrivacy
  ) =>
    go(() =>
      onNavigate(
        page === SettingsPage.Profile
          ? {
              tab: NavTab.Settings,
              details: { page, state: ProfileEditorPage.None },
            }
          : { tab: NavTab.Settings, details: { page } }
      )
    );

  const subtitle = me.username ?? me.phoneNumber;
  const isDark = theme === 'dark';

  return (
    <div
      className={classNames('BeaconNavDrawer', {
        'BeaconNavDrawer--open': open,
      })}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className="BeaconNavDrawer__backdrop"
        role="presentation"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="BeaconNavDrawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="BeaconNavDrawer__profile-row">
          <button
            type="button"
            className="BeaconNavDrawer__profile"
            onClick={settings(SettingsPage.Profile)}
          >
            <Avatar
              {...me}
              conversationType="direct"
              badge={undefined}
              i18n={i18n}
              size={AvatarSize.FORTY_EIGHT}
              theme={undefined}
            />
            <span className="BeaconNavDrawer__profile-text">
              <span className="BeaconNavDrawer__profile-name">
                {me.profileName ?? me.title}
              </span>
              {subtitle ? (
                <span className="BeaconNavDrawer__profile-sub Beacon-pii">
                  {subtitle}
                </span>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            className={classNames('BeaconNavDrawer__accounts-toggle', {
              'BeaconNavDrawer__accounts-toggle--open': accountsExpanded,
            })}
            aria-expanded={accountsExpanded}
            aria-label={accountsExpanded ? 'Hide accounts' : 'Show accounts'}
            onClick={toggleAccounts}
          >
            <AxoSymbol.Icon size={20} symbol="chevron-down" label={null} />
          </button>
        </div>
        {accountsExpanded ? (
          <BeaconAccountList open={open} onClose={onClose} />
        ) : null}

        <div className="BeaconNavDrawer__list">
          <Item
            symbol="message"
            label={i18n('icu:NavTabs__ItemLabel--Chats')}
            active={selectedNavTab === NavTab.Chats}
            trailing={<Badge count={unreadChatsCount} />}
            onSelect={go(() =>
              onNavigate({
                tab: NavTab.Chats,
                details: { conversationId: undefined },
              })
            )}
          />
          <Item
            symbol="phone"
            label={i18n('icu:NavTabs__ItemLabel--Calls')}
            active={selectedNavTab === NavTab.Calls}
            trailing={<Badge count={unreadCallsCount} />}
            onSelect={go(() => onNavigate({ tab: NavTab.Calls }))}
          />
          {storiesEnabled ? (
            <Item
              symbol="stories"
              label={i18n('icu:NavTabs__ItemLabel--Stories')}
              active={selectedNavTab === NavTab.Stories}
              trailing={
                hasFailedStorySends ? (
                  <span className="BeaconNavDrawer__badge">!</span>
                ) : (
                  <Badge count={unreadStoriesCount} />
                )
              }
              onSelect={go(() => onNavigate({ tab: NavTab.Stories }))}
            />
          ) : null}

          <div className="BeaconNavDrawer__divider" role="separator" />

          <Item symbol="compose" label="New chat" onSelect={go(onNewChat)} />
          <Item symbol="group" label="New group" onSelect={go(onNewGroup)} />
          <Item
            symbol="note"
            label={i18n('icu:noteToSelf')}
            onSelect={go(onOpenNoteToSelf)}
          />
          <Item
            symbol="archive"
            label="Archived chats"
            onSelect={go(onOpenArchived)}
          />

          <div className="BeaconNavDrawer__divider" role="separator" />

          <Item
            symbol="settings"
            label={i18n('icu:NavTabs__ItemLabel--Settings')}
            active={selectedNavTab === NavTab.Settings}
            trailing={
              hasPendingUpdate ? (
                <span className="BeaconNavDrawer__dot" />
              ) : undefined
            }
            onSelect={settings(SettingsPage.General)}
          />
          <Item
            symbol="shield-check"
            label="Beacon Privacy"
            onSelect={settings(SettingsPage.BeaconPrivacy)}
          />
          <Item
            symbol="cube"
            label="Beacon"
            onSelect={settings(SettingsPage.Beacon)}
          />
          {isLockConfigured() ? (
            <Item symbol="lock" label="Lock Beacon" onSelect={go(lock)} />
          ) : null}
          <Item
            symbol={isDark ? 'sun' : 'moon'}
            label={isDark ? 'Light mode' : 'Night mode'}
            onSelect={onToggleTheme}
          />
        </div>

        <div className="BeaconNavDrawer__footer">
          Beacon {window.SignalContext.getVersion()}
        </div>
      </div>
    </div>
  );
}
