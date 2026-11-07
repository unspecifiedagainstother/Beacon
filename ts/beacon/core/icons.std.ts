// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Addon icons.
 *
 * An addon sets `icon` on its manifest to SVG markup — written by hand, pasted
 * from an icon set, or built with defineIcon() from path data. The Modules
 * page draws it as a CSS mask, so:
 *  - it takes the theme/accent color automatically (only the shape matters;
 *    fill and stroke colors in the SVG are ignored),
 *  - it is loaded in image mode, where scripts and external references in
 *    the markup never run.
 *
 * Use a square viewBox (24×24 is the convention) and draw with
 * `currentColor` or any opaque color.
 */

export type IconOptions = {
  /** Default '0 0 24 24'. */
  viewBox?: string;
  /** Outline icons (default): stroked, no fill. Set false for solid shapes. */
  stroke?: boolean;
  /** Stroke width for outline icons. Default 2. */
  strokeWidth?: number;
};

const MAX_ICON_LENGTH = 16 * 1024;

/**
 * Build an SVG icon from one or more path `d` strings.
 *
 * @example
 *   icon: defineIcon('M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14')
 */
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

/** True if `markup` looks like a usable inline SVG document. */
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

/**
 * CSS `url(...)` value for using an SVG as a mask-image. Returns undefined for
 * anything that is not SVG markup, so callers fall back to a letter.
 */
export function iconToCssUrl(markup: string | undefined): string | undefined {
  if (!isSvgMarkup(markup)) {
    return undefined;
  }
  let svg = markup.trim();
  // A data: URI SVG needs the namespace or it renders as nothing.
  if (!svg.includes('xmlns=')) {
    svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
