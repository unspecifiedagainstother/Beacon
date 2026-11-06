// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_ENCRYPTED_EXPORTS } from '../addons/icons.std.ts';
import {
  decryptBeaconExportFile,
  ENCRYPTED_EXPORTS_ID,
} from '../core/exports.dom.ts';

export default {
  id: ENCRYPTED_EXPORTS_ID,
  builtin: true,
  category: 'privacy',
  icon: ICON_ENCRYPTED_EXPORTS,
  name: 'Exports',
  version: '1.0.0',
  description:
    'Files Beacon exports (message log, profile history) are encrypted with a password you choose.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'enabled',
      type: 'toggle',
      symbol: 'lock',
      label: 'Encrypt exports',
      description:
        'If you turn this off, exports are saved as plain JSON anyone can read.',
      defaultValue: true,
    },
  ],

  start(ctx) {
    ctx.commands.register({
      id: 'decryptexport',
      name: 'Decrypt export',
      description: 'Open a Beacon encrypted export and save a readable copy',
      execute: () => decryptBeaconExportFile(),
    });
  },
} satisfies AddonManifest;
