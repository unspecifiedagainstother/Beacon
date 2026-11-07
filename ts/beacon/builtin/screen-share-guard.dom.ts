// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';
import { drop } from '../../util/drop.std.ts';

export const ICON_SCREEN_SHARE_GUARD = defineIcon([
  'M3 4h18v12H3z',
  'M8 20h8',
  'M12 16v4',
  'M12 7v5',
  'M9.5 9.5L12 7l2.5 2.5',
]);

const ROW = '.module-conversation-list__item--contact-or-conversation';

const CSS = `
body.beacon-presenting ${ROW}__content,
body.beacon-presenting ${ROW}__avatar-container,
body.beacon-presenting .module-message__text,
body.beacon-presenting .module-message__container img,
body.beacon-presenting .module-message__container video,
body.beacon-presenting .module-quote,
body.beacon-presenting .module-conversation-hero,
body.beacon-presenting .module-ConversationHeader__header__info__title {
  filter: blur(8px);
}
`;

export default {
  id: 'screen-share-guard',
  builtin: true,
  category: 'privacy',
  icon: ICON_SCREEN_SHARE_GUARD,
  name: 'Screen sharing',
  version: '1.0.0',
  description:
    'Alert and protect your chats while you share your screen in a Signal call. Sharing through other apps can’t be detected.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'alert',
      type: 'toggle',
      symbol: 'bell',
      label: 'Tell me when screen sharing starts',
      defaultValue: true,
    },
    {
      key: 'blur',
      type: 'toggle',
      symbol: 'blur',
      label: 'Blur chats while sharing',
      description:
        'Chat list, names, messages and media are blurred until you stop sharing.',
      defaultValue: true,
    },
    {
      key: 'hideWindow',
      type: 'toggle',
      symbol: 'eyes',
      label: 'Hide the Beacon window from the shared screen',
      description:
        'Beacon shows as black in the capture while you share. Windows and macOS only.',
      defaultValue: false,
    },
  ],

  start(ctx) {
    ctx.css.inject(CSS);
    let undoBlur: (() => void) | undefined;
    let restoreProtection: boolean | undefined;

    const onStart = async () => {
      if (ctx.settings.get<boolean>('blur')) {
        undoBlur = ctx.css.bodyClass('beacon-presenting');
      }
      if (ctx.settings.get<boolean>('hideWindow')) {
        const current = (await window.IPC.beaconInvoke('settings:get')) as {
          contentProtection?: boolean;
        };
        restoreProtection = current.contentProtection === true;
        await window.IPC.beaconInvoke('content-protection:set', true);
      }
      if (ctx.settings.get<boolean>('alert')) {
        ctx.ui.showNotification(
          ctx.settings.get<boolean>('blur')
            ? 'You’re sharing your screen — chats are blurred until you stop'
            : 'You’re sharing your screen',
          'warning'
        );
      }
    };

    const onStop = async () => {
      undoBlur?.();
      undoBlur = undefined;
      if (restoreProtection !== undefined) {
        await window.IPC.beaconInvoke(
          'content-protection:set',
          restoreProtection
        );
        restoreProtection = undefined;
      }
    };

    ctx.redux.observe(
      state => {
        const call = state.calling.activeCallState;
        return call != null && 'presentingSource' in call
          ? call.presentingSource != null
          : false;
      },
      presenting => {
        drop(presenting ? onStart() : onStop());
      }
    );
    ctx.onDispose(() => drop(onStop()));
  },
} satisfies AddonManifest;
