// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { memo, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode, JSX } from 'react';
import { useSelector } from 'react-redux';
import { NavTabs } from '../../components/NavTabs.dom.tsx';
import { getIntl, getTheme } from '../selectors/user.std.ts';
import {
  getAllConversationsUnreadStats,
  getCallHistoryUnreadCount,
  getMe,
} from '../selectors/conversations.dom.ts';
import { useConversationsActions } from '../ducks/conversations.preload.ts';
import { NavTab } from '../../types/Nav.std.ts';
import { drop } from '../../util/drop.std.ts';
import { themeChanged } from '../../shims/themeChanged.dom.ts';
import { getUnreadCountForBadge } from '../../util/countUnreadStats.std.ts';
import { getAvatarThumbnail } from '../../beacon/util/avatarThumbnail.dom.ts';
import type { BeaconNavDrawerExtras } from '../../components/BeaconNavDrawer.dom.tsx';
import {
  getHasAnyFailedStorySends,
  getStoriesNotificationCount,
} from '../selectors/stories.preload.ts';
import {
  getStoriesEnabled,
  getUnreadCountBadgeType,
} from '../selectors/items.dom.ts';
import { getSelectedNavTab } from '../selectors/nav.std.ts';
import { useNavActions } from '../ducks/nav.std.ts';
import { getHasPendingUpdate } from '../selectors/updates.std.ts';

import type { Location } from '../../types/Nav.std.ts';

export type SmartNavTabsProps = Readonly<{
  navTabsCollapsed: boolean;
  onToggleNavTabsCollapse: (navTabsCollapsed: boolean) => void;
  renderCallsTab: () => ReactNode;
  renderChatsTab: () => ReactNode;
  renderStoriesTab: () => ReactNode;
  renderSettingsTab: () => ReactNode;
}>;

export const SmartNavTabs = memo(function SmartNavTabs({
  navTabsCollapsed,
  onToggleNavTabsCollapse,
  renderCallsTab,
  renderChatsTab,
  renderStoriesTab,
  renderSettingsTab,
}: SmartNavTabsProps): JSX.Element {
  const i18n = useSelector(getIntl);
  const selectedNavTab = useSelector(getSelectedNavTab);
  const unreadCountBadgeType = useSelector(getUnreadCountBadgeType);
  const storiesEnabled = useSelector(getStoriesEnabled);
  const unreadConversationsStats = useSelector(getAllConversationsUnreadStats);
  const unreadStoriesCount = useSelector(getStoriesNotificationCount);
  const unreadCallsCount = useSelector(getCallHistoryUnreadCount);
  const hasFailedStorySends = useSelector(getHasAnyFailedStorySends);
  const hasPendingUpdate = useSelector(getHasPendingUpdate);

  const { changeLocation } = useNavActions();
  const me = useSelector(getMe);
  const theme = useSelector(getTheme);
  const {
    showArchivedConversations,
    showChooseGroupMembers,
    showConversation,
    startComposing,
  } = useConversationsActions();

  // Beacon: tell the account switcher who this account is and how many
  // unread messages it has (shown in other accounts' menus and the tray).
  const accountUnread = getUnreadCountForBadge(
    unreadConversationsStats,
    unreadCountBadgeType
  );
  const accountName = me.profileName ?? me.title;
  const accountSubtitle = me.username ?? me.phoneNumber;
  const accountColor = me.color;
  const accountAvatarUrl = me.avatarUrl;
  useEffect(() => {
    drop(
      (async () => {
        const avatar = await getAvatarThumbnail(accountAvatarUrl);
        await window.IPC.beaconInvoke('accounts:report', {
          name: accountName,
          subtitle: accountSubtitle,
          color: accountColor,
          avatar,
          unread: accountUnread,
          linked: true,
        });
      })()
    );
  }, [
    accountName,
    accountSubtitle,
    accountColor,
    accountAvatarUrl,
    accountUnread,
  ]);

  const beaconDrawer = useMemo((): BeaconNavDrawerExtras => {
    const toChats = () =>
      changeLocation({
        tab: NavTab.Chats,
        details: { conversationId: undefined },
      });
    return {
      me,
      theme,
      onToggleTheme: () =>
        drop(
          (async () => {
            await window.Events.setThemeSetting(
              theme === 'dark' ? 'light' : 'dark'
            );
            await themeChanged();
          })()
        ),
      onNavigate: changeLocation,
      onNewChat: () => {
        toChats();
        startComposing();
      },
      onNewGroup: () => {
        toChats();
        showChooseGroupMembers();
      },
      onOpenNoteToSelf: () => {
        toChats();
        showConversation({ conversationId: me.id });
      },
      onOpenArchived: () => {
        toChats();
        showArchivedConversations();
      },
    };
  }, [
    changeLocation,
    me,
    theme,
    showArchivedConversations,
    showChooseGroupMembers,
    showConversation,
    startComposing,
  ]);

  const onChangeLocation = useCallback(
    (location: Location) => {
      // For some reason react-aria will call this more often than the tab
      // actually changing.
      if (location.tab !== selectedNavTab) {
        changeLocation(location);
      }
    },
    [changeLocation, selectedNavTab]
  );

  return (
    <NavTabs
      unreadCountBadgeType={unreadCountBadgeType}
      hasFailedStorySends={hasFailedStorySends}
      hasPendingUpdate={hasPendingUpdate}
      i18n={i18n}
      navTabsCollapsed={navTabsCollapsed}
      onChangeLocation={onChangeLocation}
      onToggleNavTabsCollapse={onToggleNavTabsCollapse}
      renderCallsTab={renderCallsTab}
      renderChatsTab={renderChatsTab}
      renderStoriesTab={renderStoriesTab}
      renderSettingsTab={renderSettingsTab}
      selectedNavTab={selectedNavTab}
      storiesEnabled={storiesEnabled}
      unreadCallsCount={unreadCallsCount}
      unreadConversationsStats={unreadConversationsStats}
      unreadStoriesCount={unreadStoriesCount}
      beaconDrawer={beaconDrawer}
    />
  );
});
