// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Tracking-parameter removal for the clear-urls addon. Pure string work, kept
 * separate so it can be unit tested without loading the app.
 */

export const DEFAULT_TRACKING_PARAMS = [
  'utm_*',
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'igsh',
  'si',
  'ref_src',
  'ref_url',
  'yclid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'spm',
  'share_id',
].join(', ');

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

export function toParamMatchers(
  list: string
): Array<(name: string) => boolean> {
  return list
    .split(/[\s,]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .map(item =>
      item.endsWith('*')
        ? (name: string) => name.toLowerCase().startsWith(item.slice(0, -1))
        : (name: string) => name.toLowerCase() === item
    );
}

export function cleanUrl(
  raw: string,
  matchers: ReadonlyArray<(name: string) => boolean>
): string {
  // Keep trailing punctuation outside the URL ("see https://x.com/a?b=1.").
  const trailing = /[.,;:!?)\]]+$/.exec(raw)?.[0] ?? '';
  const candidate = trailing ? raw.slice(0, -trailing.length) : raw;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return raw;
  }

  let changed = false;
  for (const name of Array.from(url.searchParams.keys())) {
    if (matchers.some(match => match(name))) {
      url.searchParams.delete(name);
      changed = true;
    }
  }
  if (!changed) {
    return raw;
  }
  return url.toString() + trailing;
}

export function cleanUrlsInText(
  text: string,
  matchers: ReadonlyArray<(name: string) => boolean>
): string {
  return text.replace(URL_RE, match => cleanUrl(match, matchers));
}
