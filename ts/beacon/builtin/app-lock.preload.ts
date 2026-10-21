// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * App lock: passphrase on open, auto-lock after inactivity or when the
 * computer locks/sleeps, and the duress passphrase. Passphrase storage and
 * the lock screen live in ../core/lock.dom.ts (so the startup lock is up
 * before any chat renders); this built-in adds the timers, shortcuts,
 * notification hiding and the duress actions. Passphrase buttons are on
 * the Privacy tab.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import {
  isLockConfigured,
  isLocked,
  lock,
  onLockChange,
  setUnlockHandler,
} from '../core/lock.dom.ts';
import { deleteAllData } from '../../shims/deleteAllData.preload.ts';
import { createLogger } from '../../logging/log.std.ts';
import { drop } from '../../util/drop.std.ts';

const log = createLogger('beacon/app-lock');

export const ICON_APP_LOCK = defineIcon([
  'M5 11h14v10H5z',
  'M8 11V7a4 4 0 0 1 8 0v4',
  'M12 15v2',
]);

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'wheel',
  'touchstart',
] as const;

export default {
  id: 'app-lock',
  builtin: true,
  category: 'privacy',
  icon: ICON_APP_LOCK,
  name: 'App lock',
  version: '1.0.0',
  description:
    'Ask for a passphrase when Beacon opens and after you’ve been away. This locks the window; it doesn’t re-encrypt Signal’s database.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'autoLockMinutes',
      type: 'number',
      symbol: 'timer',
      label: 'Lock after inactivity (minutes)',
      description: '0 means never. Mod+Alt+L locks right away.',
      min: 0,
      max: 1440,
      defaultValue: 5,
    },
    {
      key: 'lockOnSystemLock',
      type: 'toggle',
      symbol: 'device-laptop',
      label: 'Lock when the computer locks or sleeps',
      defaultValue: true,
    },
    {
      key: 'lockedNotifications',
      type: 'select',
      symbol: 'bell',
      label: 'Notifications while locked',
      options: [
        { value: 'generic', label: '“New message” only' },
        { value: 'none', label: 'None' },
        { value: 'normal', label: 'As usual' },
      ],
      defaultValue: 'generic',
    },
  ],

  start(ctx) {
    setUnlockHandler(result => {
      if (result.kind !== 'duress') {
        return;
      }
      log.info('duress unlock');
      if (result.action === 'wipe') {
        drop(deleteAllData(() => undefined));
      }
      // 'decoy': hidden-chats reads isDuressSession() and keeps hidden and
      // locked chats out of sight for the rest of the session.
    });
    ctx.onDispose(() => setUnlockHandler(undefined));

    // -- Inactivity
    let lastActivity = Date.now();
    const onActivity = () => {
      lastActivity = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, {
        capture: true,
        passive: true,
      });
    }
    const timer = setInterval(() => {
      const minutes = ctx.settings.get<number>('autoLockMinutes');
      if (
        minutes > 0 &&
        !isLocked() &&
        isLockConfigured() &&
        Date.now() - lastActivity > minutes * 60_000
      ) {
        lock();
      }
    }, 15_000);
    ctx.onDispose(() => {
      clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity, { capture: true });
      }
    });
    ctx.onDispose(
      onLockChange(event => {
        if (event === 'unlocked') {
          lastActivity = Date.now();
        }
      })
    );

    // -- System lock / sleep
    ctx.onDispose(
      window.IPC.beaconOnSystemEvent(() => {
        if (ctx.settings.get<boolean>('lockOnSystemLock')) {
          lock();
        }
      })
    );

    // -- Lock now
    ctx.keybinds.register('mod+alt+L', () => lock());
    ctx.commands.register({
      id: 'lock',
      name: 'Lock Beacon',
      description: 'Lock now (needs a passphrase set in Beacon Privacy)',
      execute: cmd => {
        if (!isLockConfigured()) {
          cmd.reply(
            'Set a passphrase first: Settings → Beacon Privacy',
            'warning'
          );
          return;
        }
        lock();
      },
    });

    // -- Notifications while locked
    ctx.filters.add('notification.show', show => {
      if (show && isLocked()) {
        return ctx.settings.get<string>('lockedNotifications') !== 'none';
      }
      return show;
    });
    ctx.filters.add('notification.content', content => {
      if (
        isLocked() &&
        ctx.settings.get<string>('lockedNotifications') === 'generic'
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
