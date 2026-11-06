// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type HasKind = 'link' | 'file' | 'image' | 'video' | 'audio' | 'media';

export type SearchFilters = Readonly<{
  text: string;
  from?: string;
  before?: number;
  after?: number;
  has: ReadonlyArray<HasKind>;
}>;

const HAS_KINDS = new Set<string>([
  'link',
  'file',
  'image',
  'video',
  'audio',
  'media',
]);

const DAY = 24 * 60 * 60 * 1000;

function parseDate(value: string, now: number): number | undefined {
  const lower = value.toLowerCase();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (lower === 'today') {
    return startOfToday.getTime();
  }
  if (lower === 'yesterday') {
    return startOfToday.getTime() - DAY;
  }
  const match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(value);
  if (!match) {
    return undefined;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    match[3] ? Number(match[3]) : 1
  );
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

export function parseSearchFilters(
  query: string,
  now = Date.now()
): SearchFilters {
  let from: string | undefined;
  let before: number | undefined;
  let after: number | undefined;
  const has: Array<HasKind> = [];

  const text = query
    .replace(
      /(^|\s)(from|before|after|has):(?:"([^"]*)"|(\S+))/gi,
      (whole, lead: string, key: string, quoted?: string, plain?: string) => {
        const value = (quoted ?? plain ?? '').trim();
        const k = key.toLowerCase();
        if (k === 'from' && value) {
          from = value.toLowerCase();
          return lead;
        }
        if (k === 'before' || k === 'after') {
          const date = parseDate(value, now);
          if (date === undefined) {
            return whole;
          }
          if (k === 'before') {
            before = date;
          } else {
            after = date + (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value) ? DAY : 0);
          }
          return lead;
        }
        if (k === 'has' && HAS_KINDS.has(value.toLowerCase())) {
          has.push(value.toLowerCase() as HasKind);
          return lead;
        }
        return whole;
      }
    )
    .replace(/\s+/g, ' ')
    .trim();

  return { text, from, before, after, has };
}

export function hasFilters(filters: SearchFilters): boolean {
  return (
    filters.from !== undefined ||
    filters.before !== undefined ||
    filters.after !== undefined ||
    filters.has.length > 0
  );
}

export type FilterableMessage = Readonly<{
  type?: string;
  sent_at?: number;
  body?: string;
  sourceServiceId?: string;
  attachments?: ReadonlyArray<Readonly<{ contentType?: string }>>;
  preview?: ReadonlyArray<unknown>;
}>;

function kindsOf(message: FilterableMessage): Set<HasKind> {
  const kinds = new Set<HasKind>();
  for (const attachment of message.attachments ?? []) {
    const type = attachment.contentType ?? '';
    if (type.startsWith('image/')) {
      kinds.add('image');
      kinds.add('media');
    } else if (type.startsWith('video/')) {
      kinds.add('video');
      kinds.add('media');
    } else if (type.startsWith('audio/')) {
      kinds.add('audio');
    } else {
      kinds.add('file');
    }
  }
  if (
    (message.preview?.length ?? 0) > 0 ||
    /https?:\/\/\S+/i.test(message.body ?? '')
  ) {
    kinds.add('link');
  }
  return kinds;
}

export function matchesFilters(
  message: FilterableMessage,
  filters: SearchFilters,
  senderName: (message: FilterableMessage) => string
): boolean {
  const sentAt = message.sent_at ?? 0;
  if (filters.before !== undefined && sentAt >= filters.before) {
    return false;
  }
  if (filters.after !== undefined && sentAt < filters.after) {
    return false;
  }
  if (filters.from !== undefined) {
    const wanted = filters.from;
    if (wanted === 'me' || wanted === 'you') {
      if (message.type !== 'outgoing') {
        return false;
      }
    } else if (!senderName(message).toLowerCase().includes(wanted)) {
      return false;
    }
  }
  if (filters.has.length > 0) {
    const kinds = kindsOf(message);
    if (!filters.has.every(kind => kinds.has(kind))) {
      return false;
    }
  }
  return true;
}
