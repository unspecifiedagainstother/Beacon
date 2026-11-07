// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_APP_PRIVACY } from '../addons/icons.std.ts';
import { drop } from '../../util/drop.std.ts';

const UNREAD_SUFFIX = /\s*\(\d+\)\s*$/;

export default {
  id: 'app-privacy',
  builtin: true,
  category: 'privacy',
  icon: ICON_APP_PRIVACY,
  name: 'Window & system',
  version: '1.0.0',
  description:
    'What the rest of your computer can see: screen captures, the window title, the unread badge and spellcheck downloads.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'screenProtection',
      type: 'toggle',
      symbol: 'eyes',
      label: 'Hide Beacon from screenshots and screen sharing',
      description:
        'The window shows as black in captures. Works on Windows and macOS; most Linux desktops ignore it.',
      defaultValue: false,
    },
    {
      key: 'neutralTitle',
      type: 'toggle',
      symbol: 'text-square',
      label: 'Neutral window title',
      description: 'The title stays “Beacon”, without an unread count.',
      defaultValue: true,
    },
    {
      key: 'hideBadge',
      type: 'toggle',
      symbol: 'bell-slash',
      label: 'Hide unread count on tray and taskbar',
      defaultValue: true,
    },
    {
      key: 'blockSpellcheck',
      type: 'toggle',
      symbol: 'globe',
      label: 'Block spellcheck dictionary downloads',
      description:
        'Spellcheck uses only dictionaries already on this computer. On Linux that may mean no spellcheck for some languages.',
      defaultValue: true,
    },
  ],

  start(ctx) {
    const syncMain = async () => {
      await window.IPC.beaconInvoke(
        'content-protection:set',
        ctx.settings.get<boolean>('screenProtection')
      );
      await window.IPC.beaconInvoke(
        'spellcheck-block:set',
        ctx.settings.get<boolean>('blockSpellcheck')
      );
    };
    drop(syncMain());

    const titleEl = document.querySelector('title');
    const neutralize = () => {
      if (!ctx.settings.get<boolean>('neutralTitle')) {
        return;
      }
      if (UNREAD_SUFFIX.test(document.title)) {
        document.title = document.title.replace(UNREAD_SUFFIX, '');
      }
    };
    if (titleEl) {
      const observer = new MutationObserver(neutralize);
      observer.observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      ctx.onDispose(() => observer.disconnect());
    }
    neutralize();

    const zeroIfHidden = (args: Array<unknown>) =>
      ctx.settings.get<boolean>('hideBadge') ? [0] : args;
    ctx.patcher.before(window.IPC, 'setBadgeCount', zeroIfHidden);
    ctx.patcher.before(window.IPC, 'updateTrayIcon', zeroIfHidden);

    const refreshUnread = () => {
      window.ConversationController.updateUnreadCount();
    };
    refreshUnread();

    ctx.settings.onChange(key => {
      if (key === 'screenProtection' || key === 'blockSpellcheck') {
        drop(syncMain());
      } else if (key === 'hideBadge' || key === 'neutralTitle') {
        refreshUnread();
        neutralize();
      }
    });
  },
} satisfies AddonManifest;
