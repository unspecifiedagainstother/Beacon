// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  ConversationColorType,
  CustomColorType,
} from '../../types/Colors.std.ts';

const CHAT_COLOR_HEX: Record<
  Exclude<ConversationColorType, 'custom'>,
  string
> = {
  ultramarine: '#2c6bed',
  crimson: '#cf163e',
  vermilion: '#c73f0a',
  burlap: '#6f6a58',
  forest: '#3b7845',
  wintergreen: '#1d8663',
  teal: '#077d92',
  blue: '#336ba3',
  indigo: '#6058ca',
  violet: '#9932c8',
  plum: '#aa377a',
  taupe: '#8f616a',
  steel: '#71717f',
  ember: '#e57c00',
  midnight: '#787891',
  infrared: '#f65560',
  lagoon: '#32867d',
  fluorescent: '#ec13dd',
  basil: '#2f9373',
  sublime: '#6281d5',
  sea: '#498fd4',
  tangerine: '#db7133',
};

export const DEFAULT_ACCENT = CHAT_COLOR_HEX.ultramarine;

function hslToHex(hue: number, saturation: number, lightness = 0.45): string {
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function getAccentHex(
  selection:
    | {
        color: ConversationColorType;
        customColorData?: { value: CustomColorType };
      }
    | undefined
): string {
  if (!selection) {
    return DEFAULT_ACCENT;
  }
  if (selection.color === 'custom') {
    const start = selection.customColorData?.value.start;
    return start
      ? hslToHex(start.hue, start.saturation, start.lightness)
      : DEFAULT_ACCENT;
  }
  return CHAT_COLOR_HEX[selection.color] ?? DEFAULT_ACCENT;
}

export function getAccentProperties(hex: string): Record<string, string> {
  return {
    '--beacon-accent': hex,
    '--beacon-brand': hex,
    '--beacon-accent-pressed': `color-mix(in srgb, ${hex} 82%, black)`,
    '--beacon-accent-tint': `color-mix(in srgb, ${hex} 16%, transparent)`,
    '--beacon-accent-text': `color-mix(in srgb, ${hex} 70%, var(--axo-color-label-primary))`,
    '--axo-color-fill-accent': hex,
    '--axo-color-fill-accent-pressed': `color-mix(in srgb, ${hex} 82%, black)`,
    '--axo-color-fill-accent-tint': `color-mix(in srgb, ${hex} 14%, transparent)`,
    '--axo-color-fill-accent-tint-pressed': `color-mix(in srgb, ${hex} 20%, transparent)`,
    '--axo-color-label-accent': `color-mix(in srgb, ${hex} 70%, var(--axo-color-label-primary))`,
    '--axo-color-border-focused-outer': hex,
  };
}
