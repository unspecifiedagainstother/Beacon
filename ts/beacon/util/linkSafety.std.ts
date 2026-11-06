// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type LinkWarning =
  | 'not-https'
  | 'punycode'
  | 'ip-address'
  | 'credentials'
  | 'shortener'
  | 'text-mismatch'
  | 'unusual-port';

export type LinkAnalysis = {
  url: URL;
  host: string;
  site: string;
  warnings: Array<LinkWarning>;
};

const SHORTENERS = new Set([
  'bit.ly',
  'bitly.com',
  't.co',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'cutt.ly',
  'rebrand.ly',
  'rb.gy',
  'shorturl.at',
  'tiny.cc',
  'lnkd.in',
  's.id',
  'v.gd',
  't.ly',
  'shorturl.com',
  'trib.al',
  'dlvr.it',
]);

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);

export const LINK_WARNING_TEXT: Record<LinkWarning, string> = {
  'not-https': 'The connection is not encrypted (http).',
  punycode:
    'The address uses international characters, which can imitate a well-known site.',
  'ip-address': 'The link points to a raw IP address instead of a name.',
  credentials:
    'The link contains a user name before the address, a trick used to disguise where it goes.',
  shortener: 'This is a link shortener — the real destination is hidden.',
  'text-mismatch': 'The link text shows a different site than where it goes.',
  'unusual-port': 'The link uses an unusual port.',
};

export function siteOf(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length <= 2) {
    return labels.join('.');
  }
  const last = labels.at(-1) ?? '';
  const second = labels.at(-2) ?? '';
  const take = last.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join('.');
}

export function toUnicodeHost(hostname: string): string {
  return hostname
    .split('.')
    .map(label => {
      if (!label.startsWith('xn--')) {
        return label;
      }
      try {
        return decodePunycode(label.slice(4));
      } catch {
        return label;
      }
    })
    .join('.');
}

function decodePunycode(input: string): string {
  const base = 36;
  const tMin = 1;
  const tMax = 26;
  const skew = 38;
  const damp = 700;
  let n = 128;
  let i = 0;
  let bias = 72;
  const delimiter = input.lastIndexOf('-');
  const output = delimiter > 0 ? input.slice(0, delimiter).split('') : [];
  let index = delimiter > 0 ? delimiter + 1 : 0;

  const adapt = (deltaIn: number, numPoints: number, first: boolean) => {
    let delta = first ? Math.floor(deltaIn / damp) : Math.floor(deltaIn / 2);
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > Math.floor(((base - tMin) * tMax) / 2)) {
      delta = Math.floor(delta / (base - tMin));
      k += base;
    }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };

  while (index < input.length) {
    const oldI = i;
    let w = 1;
    for (let k = base; ; k += base) {
      const code = input.charCodeAt(index);
      index += 1;
      let digit: number;
      if (code >= 48 && code <= 57) {
        digit = code - 22;
      } else if (code >= 65 && code <= 90) {
        digit = code - 65;
      } else if (code >= 97 && code <= 122) {
        digit = code - 97;
      } else {
        throw new Error('bad punycode');
      }
      i += digit * w;
      const t = Math.min(Math.max(k - bias, tMin), tMax);
      if (digit < t) {
        break;
      }
      w *= base - t;
      if (index >= input.length) {
        throw new Error('bad punycode');
      }
    }
    bias = adapt(i - oldI, output.length + 1, oldI === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    output.splice(i, 0, String.fromCodePoint(n));
    i += 1;
  }
  return output.join('');
}

function hostInText(text: string): string | undefined {
  const match =
    /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]|$)/i.exec(
      text.trim()
    );
  return match?.[1]?.toLowerCase();
}

export function analyzeLink(
  raw: string,
  linkText?: string
): LinkAnalysis | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const warnings: Array<LinkWarning> = [];
  const hostname = url.hostname.toLowerCase();

  if (url.protocol === 'http:') {
    warnings.push('not-https');
  }
  if (hostname.split('.').some(label => label.startsWith('xn--'))) {
    warnings.push('punycode');
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[')) {
    warnings.push('ip-address');
  }
  if (url.username || url.password) {
    warnings.push('credentials');
  }
  if (SHORTENERS.has(hostname) || SHORTENERS.has(siteOf(hostname))) {
    warnings.push('shortener');
  }
  if (url.port && url.port !== '443' && url.port !== '80') {
    warnings.push('unusual-port');
  }
  if (linkText) {
    const shown = hostInText(linkText);
    if (shown && siteOf(shown) !== siteOf(hostname)) {
      warnings.push('text-mismatch');
    }
  }

  return {
    url,
    host: toUnicodeHost(hostname),
    site: siteOf(hostname),
    warnings,
  };
}

export function isTrustedSite(
  hostname: string,
  trusted: ReadonlyArray<string>
): boolean {
  const host = hostname.toLowerCase();
  return trusted.some(entry => {
    const domain = entry.trim().toLowerCase().replace(/^\*\./, '');
    return domain !== '' && (host === domain || host.endsWith(`.${domain}`));
  });
}
