// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_TEXT_FACES } from './icons.std.ts';

const FACES: ReadonlyArray<[id: string, face: string, label: string]> = [
  ['tableflip', '(╯°□°)╯︵ ┻━┻', 'Flip a table'],
  ['unflip', '┬─┬ノ( º _ ºノ)', 'Put the table back'],
  ['lenny', '( ͡° ͜ʖ ͡°)', 'Lenny face'],
  ['disapprove', 'ಠ_ಠ', 'Look of disapproval'],
  ['sparkles', '✧･ﾟ: *✧･ﾟ:*', 'Sparkles'],
  ['bear', 'ʕ•ᴥ•ʔ', 'Bear'],
  ['cry', '(╥﹏╥)', 'Crying'],
  ['hug', '(っ◕‿◕)っ', 'Hug'],
  ['dance', '♪┏(・o・)┛♪', 'Dance'],
];

export default {
  id: 'text-faces',
  icon: ICON_TEXT_FACES,
  name: 'Text Faces',
  version: '1.0.0',
  description: '/tableflip, /unflip, /lenny, /disapprove and more.',
  authors: ['Beacon'],
  tags: ['fun'],
  start(ctx) {
    for (const [id, face, label] of FACES) {
      ctx.commands.register({
        id,
        name: label,
        usage: '[text]',
        description: `${label} ${face}`,
        execute: cmd =>
          cmd.insertText(cmd.argsRaw ? `${cmd.argsRaw} ${face}` : face),
      });
    }
  },
} satisfies AddonManifest;
