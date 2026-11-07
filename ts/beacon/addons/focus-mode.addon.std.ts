// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest, Disposer } from '../core/types.dom.ts';
import { ICON_FOCUS_MODE } from './icons.std.ts';

const FOCUS_CSS = `
  .NavSidebar,
  .NavTabs__Container,
  .module-conversation-list {
    display: none !important;
  }
`;

export default {
  id: 'focus-mode',
  icon: ICON_FOCUS_MODE,
  name: 'Focus Mode',
  version: '2.0.0',
  description: 'Ctrl/⌘+Alt+F or /focus hides the sidebar and tabs.',
  authors: ['Beacon'],
  tags: ['ui'],
  start(ctx) {
    let active: Disposer | undefined;

    const toggle = () => {
      if (active) {
        active();
        active = undefined;
        ctx.ui.showNotification('Focus mode off');
      } else {
        active = ctx.css.inject(FOCUS_CSS);
        ctx.ui.showNotification('Focus mode on');
      }
    };

    ctx.keybinds.register('mod+alt+f', toggle);
    ctx.commands.register({
      id: 'focus',
      name: 'Toggle focus mode',
      description: 'Hide sidebar and tabs',
      execute: () => toggle(),
    });

    ctx.log('focus mode ready');
  },
} satisfies AddonManifest;
