// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { BEACON_STATE_CHANGED } from '../../state/ducks/beacon.std.ts';
import { defineIcon } from '../core/icons.std.ts';
import { setHiddenChatsState } from '../core/hidden-chats.std.ts';
import {
  isDuressSession,
  isLockConfigured,
  onLockChange,
  verifyPassphrase,
} from '../core/lock.dom.ts';
import { askConfirm, askPassword } from '../core/prompts.dom.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { CHANGE_LOCATION } from '../../state/ducks/nav.std.ts';
import { TARGETED_CONVERSATION_CHANGED } from '../../state/ducks/conversations.preload.ts';
import { drop } from '../../util/drop.std.ts';

export const ICON_HIDDEN_CHATS = defineIcon([
  'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 0 1 15.5 4.8',
  'M3 3l18 18',
]);

const HIDDEN_KEY = 'beaconHiddenChats';
const LOCKED_KEY = 'beaconLockedChats';

async function confirmPassphrase(title: string): Promise<boolean> {
  if (!isLockConfigured()) {
    return true;
  }
  const passphrase = await askPassword({ title, submitLabel: 'Unlock' });
  if (passphrase == null) {
    return false;
  }
  const result = await verifyPassphrase(passphrase);
  return result.kind === 'real' && !isDuressSession();
}

export default {
  id: 'hidden-chats',
  builtin: true,
  category: 'privacy',
  icon: ICON_HIDDEN_CHATS,
  name: 'Hidden & locked chats',
  version: '1.0.0',
  description:
    'Hide a chat from the list and search, or lock it behind your passphrase, from the chat’s ⋯ menu. Mod+Alt+J shows hidden chats.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'notifications',
      type: 'select',
      symbol: 'bell',
      label: 'Notifications from hidden and locked chats',
      options: [
        { value: 'generic', label: '“New message” only' },
        { value: 'none', label: 'None' },
        { value: 'normal', label: 'As usual' },
      ],
      defaultValue: 'generic',
    },
  ],

  start(ctx) {
    let revealed = false;
    const unlockedChats = new Set<string>();

    const hidden = () => new Set(itemStorage.get(HIDDEN_KEY) ?? []);
    const locked = () => new Set(itemStorage.get(LOCKED_KEY) ?? []);

    const sync = () => {
      const hiddenIds = hidden();
      const lockedIds = locked();
      const duress = isDuressSession();
      const excluded = new Set<string>();
      if (!revealed || duress) {
        for (const id of hiddenIds) {
          excluded.add(id);
        }
      }
      if (duress) {
        for (const id of lockedIds) {
          excluded.add(id);
        }
      }
      const redacted = [...lockedIds].filter(id => !unlockedChats.has(id));
      setHiddenChatsState({ excluded, redacted });
      ctx.redux.dispatch({ type: BEACON_STATE_CHANGED });
    };

    const save = async (
      key: typeof HIDDEN_KEY | typeof LOCKED_KEY,
      ids: Set<string>
    ) => {
      await itemStorage.put(key, [...ids]);
      sync();
    };

    sync();
    ctx.onDispose(() => {
      setHiddenChatsState({ excluded: [], redacted: [] });
      ctx.redux.dispatch({ type: BEACON_STATE_CHANGED });
    });

    const isGuarded = (id: string) =>
      (locked().has(id) && !unlockedChats.has(id) && isLockConfigured()) ||
      (isDuressSession() && (locked().has(id) || hidden().has(id)));

    const closeIfOpen = (id: string) => {
      const { nav } = ctx.redux.getState();
      const open =
        nav.selectedLocation.tab === 'Chats'
          ? nav.selectedLocation.details.conversationId
          : undefined;
      if (open === id) {
        window.reduxActions.conversations.showConversation({
          conversationId: undefined,
        });
      }
    };

    ctx.onDispose(
      onLockChange(event => {
        if (event === 'locked') {
          revealed = false;
          unlockedChats.clear();
          sync();
          const { nav } = ctx.redux.getState();
          if (nav.selectedLocation.tab === 'Chats') {
            const id = nav.selectedLocation.details.conversationId;
            if (id && (locked().has(id) || hidden().has(id))) {
              closeIfOpen(id);
            }
          }
        } else if (event === 'unlocked') {
          sync();
        }
      })
    );

    let prompting = false;
    const askToOpen = async (id: string) => {
      if (prompting || isDuressSession()) {
        return;
      }
      prompting = true;
      try {
        const ok = await confirmPassphrase('This chat is locked');
        if (!ok) {
          return;
        }
        unlockedChats.add(id);
        sync();
        window.reduxActions.conversations.showConversation({
          conversationId: id,
        });
      } finally {
        prompting = false;
      }
    };

    ctx.actions.intercept(CHANGE_LOCATION, action => {
      const location = (
        action.payload as
          | {
              selectedLocation?: {
                tab?: string;
                details?: { conversationId?: string };
              };
            }
          | undefined
      )?.selectedLocation;
      const id =
        location?.tab === 'Chats'
          ? location.details?.conversationId
          : undefined;
      if (id && isGuarded(id)) {
        drop(askToOpen(id));
        return null;
      }
      return action;
    });
    ctx.actions.intercept(TARGETED_CONVERSATION_CHANGED, action => {
      const id = (action.payload as { conversationId?: string } | undefined)
        ?.conversationId;
      return id && isGuarded(id) ? null : action;
    });

    const reveal = async () => {
      if (revealed) {
        revealed = false;
        sync();
        ctx.ui.showNotification('Hidden chats are hidden again');
        return;
      }
      if (hidden().size === 0) {
        ctx.ui.showNotification('No hidden chats');
        return;
      }
      if (!(await confirmPassphrase('Show hidden chats'))) {
        return;
      }
      revealed = true;
      sync();
      ctx.ui.showNotification(
        'Hidden chats shown until Beacon locks — Mod+Alt+J hides them'
      );
    };
    ctx.keybinds.register('mod+alt+J', () => drop(reveal()));
    ctx.commands.register({
      id: 'hidden',
      name: 'Show hidden chats',
      description: 'Show or re-hide hidden chats',
      execute: () => reveal(),
    });

    ctx.filters.add('conversation.menuItems', (items, { conversationId }) => {
      if (isDuressSession()) {
        return items;
      }
      const isHidden = hidden().has(conversationId);
      const isLocked = locked().has(conversationId);
      return [
        ...items,
        {
          id: 'beacon-hide-chat',
          label: isHidden ? 'Unhide chat' : 'Hide chat',
          symbol: 'eyes',
          onSelect: () => {
            drop(
              (async () => {
                const ids = hidden();
                if (isHidden) {
                  ids.delete(conversationId);
                  await save(HIDDEN_KEY, ids);
                  ctx.ui.showNotification('Chat unhidden');
                  return;
                }
                if (!isLockConfigured()) {
                  const go = await askConfirm({
                    title: 'Hide without a passphrase?',
                    body: 'Anyone using this computer can show hidden chats with Mod+Alt+J until you set a passphrase under Settings → Beacon Privacy → App lock.',
                    confirmLabel: 'Hide anyway',
                  });
                  if (!go) {
                    return;
                  }
                }
                ids.add(conversationId);
                await save(HIDDEN_KEY, ids);
                closeIfOpen(conversationId);
                ctx.ui.showNotification(
                  'Chat hidden — Mod+Alt+J shows hidden chats'
                );
              })()
            );
          },
        },
        {
          id: 'beacon-lock-chat',
          label: isLocked ? 'Remove chat lock' : 'Lock chat',
          symbol: isLocked ? 'lock-open' : 'lock',
          onSelect: () => {
            drop(
              (async () => {
                const ids = locked();
                if (isLocked) {
                  if (!(await confirmPassphrase('Remove chat lock'))) {
                    return;
                  }
                  ids.delete(conversationId);
                  unlockedChats.delete(conversationId);
                  await save(LOCKED_KEY, ids);
                  ctx.ui.showNotification('Chat lock removed');
                  return;
                }
                if (!isLockConfigured()) {
                  await askConfirm({
                    title: 'Set a passphrase first',
                    body: 'Locked chats open with your app passphrase. Set one under Settings → Beacon Privacy → App lock.',
                    confirmLabel: 'OK',
                  });
                  return;
                }
                ids.add(conversationId);
                await save(LOCKED_KEY, ids);
                closeIfOpen(conversationId);
                ctx.ui.showNotification('Chat locked');
              })()
            );
          },
        },
      ];
    });

    const isSecret = (id: string) => hidden().has(id) || locked().has(id);
    ctx.filters.add('notification.show', (show, info) => {
      if (!show || !isSecret(info.conversationId)) {
        return show;
      }
      if (isDuressSession()) {
        return false;
      }
      return ctx.settings.get<string>('notifications') !== 'none';
    });
    ctx.filters.add('notification.content', (content, info) => {
      if (
        isSecret(info.conversationId) &&
        ctx.settings.get<string>('notifications') !== 'normal'
      ) {
        return {
          title: 'Beacon',
          body: window.SignalContext.i18n('icu:newMessage'),
          iconUrl: null,
          iconAbsolutePath: null,
        };
      }
      return content;
    });
  },
} satisfies AddonManifest;
