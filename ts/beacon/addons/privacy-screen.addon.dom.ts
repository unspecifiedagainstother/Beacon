// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Privacy Screen — cover the whole window with a blur on demand
 * (Ctrl/⌘+Alt+H), when the window loses focus, or after a period of
 * inactivity. Click, press a key or use the shortcut again to reveal.
 *
 * This is a shoulder-surfing guard, not a lock: the app keeps running and
 * the content is still in memory. Signal Desktop has no passphrase lock yet
 * (see todo.md).
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_PRIVACY_SCREEN } from './icons.std.ts';

const CSS = `
.BeaconPrivacyScreen {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 0.35);
  backdrop-filter: blur(28px) saturate(80%);
  cursor: pointer;
  user-select: none;
}
.BeaconPrivacyScreen__label {
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 0.875rem;
  color: #fff;
  background: rgb(0 0 0 / 0.45);
}
`;

export default {
  id: 'privacy-screen',
  icon: ICON_PRIVACY_SCREEN,
  name: 'Privacy Screen',
  version: '1.0.0',
  description:
    'Blur the whole window with Ctrl/⌘+Alt+H, on focus loss, or when idle.',
  authors: ['Beacon'],
  tags: ['privacy'],
  settings: [
    {
      key: 'onBlur',
      type: 'toggle',
      label: 'Hide when the window loses focus',
      defaultValue: false,
    },
    {
      key: 'idleMinutes',
      type: 'number',
      label: 'Hide after inactivity (minutes)',
      description: '0 turns this off.',
      defaultValue: 0,
      min: 0,
      max: 240,
    },
  ],

  start(ctx) {
    ctx.css.inject(CSS);

    let overlay: HTMLElement | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const hide = () => {
      if (overlay) {
        return;
      }
      overlay = ctx.ui.createElement({
        tag: 'div',
        className: 'BeaconPrivacyScreen',
        attrs: { role: 'button', 'aria-label': 'Reveal Beacon' },
        children: [
          ctx.ui.createElement({
            tag: 'div',
            className: 'BeaconPrivacyScreen__label',
            text: 'Hidden — click or press any key to show',
          }),
        ],
        onClick: () => reveal(),
      });
      document.body.appendChild(overlay);
    };

    const reveal = () => {
      overlay?.remove();
      overlay = undefined;
      resetIdle();
    };

    const resetIdle = () => {
      clearTimeout(idleTimer);
      const minutes = ctx.settings.get<number>('idleMinutes');
      if (minutes > 0) {
        idleTimer = setTimeout(hide, minutes * 60_000);
      }
    };

    ctx.keybinds.register('mod+alt+h', () => (overlay ? reveal() : hide()));

    ctx.dom.on(window, 'blur', () => {
      if (ctx.settings.get<boolean>('onBlur')) {
        hide();
      }
    });

    // Any key reveals; capture phase so the key doesn't also reach the app.
    ctx.dom.on(
      document,
      'keydown',
      ev => {
        if (overlay) {
          ev.preventDefault();
          ev.stopPropagation();
          reveal();
        }
      },
      { capture: true }
    );

    const onActivity = () => {
      if (!overlay) {
        resetIdle();
      }
    };
    for (const type of ['mousemove', 'keydown', 'mousedown', 'wheel']) {
      ctx.dom.on(document, type, onActivity, { passive: true });
    }
    resetIdle();
    ctx.settings.onChange(key => {
      if (key === 'idleMinutes') {
        resetIdle();
      }
    });

    ctx.commands.register({
      id: 'hide',
      name: 'Privacy screen',
      description: 'Blur the window until you click',
      execute: () => hide(),
    });

    ctx.onDispose(() => {
      clearTimeout(idleTimer);
      overlay?.remove();
    });
  },
} satisfies AddonManifest;
