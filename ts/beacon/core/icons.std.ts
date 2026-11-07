// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type IconOptions = {
  viewBox?: string;
  stroke?: boolean;
  strokeWidth?: number;
};

const MAX_ICON_LENGTH = 16 * 1024;

export function defineIcon(
  paths: string | ReadonlyArray<string>,
  { viewBox = '0 0 24 24', stroke = true, strokeWidth = 2 }: IconOptions = {}
): string {
  const list = typeof paths === 'string' ? [paths] : paths;
  const paint = stroke
    ? `fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
    : 'fill="#000"';
  const body = list.map(d => `<path d="${escapeAttr(d)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttr(viewBox)}" ${paint}>${body}</svg>`;
}

function escapeAttr(value: string): string {
  return value.replace(/[&"<>]/g, ch => `&#${ch.charCodeAt(0)};`);
}

export function isSvgMarkup(markup: string | undefined): markup is string {
  if (!markup) {
    return false;
  }
  const trimmed = markup.trim();
  return (
    trimmed.length <= MAX_ICON_LENGTH &&
    /^<svg[\s>]/i.test(trimmed) &&
    /<\/svg>\s*$/i.test(trimmed)
  );
}

export function iconToCssUrl(markup: string | undefined): string | undefined {
  if (!isSvgMarkup(markup)) {
    return undefined;
  }
  let svg = markup.trim();
  if (!svg.includes('xmlns=')) {
    svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
