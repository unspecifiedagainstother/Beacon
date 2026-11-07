// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type NetworkEntry = {
  host: string;
  port: number | undefined;
  source: 'socket' | 'web';
  first: number;
  last: number;
  count: number;
};

const MAX_HOSTS = 500;

const entries = new Map<string, NetworkEntry>();
const listeners = new Set<() => void>();

export function recordConnection(
  host: string,
  port: number | undefined,
  source: NetworkEntry['source'],
  at = Date.now()
): void {
  if (!host) {
    return;
  }
  const key = `${source}|${host}|${port ?? ''}`;
  const existing = entries.get(key);
  if (existing) {
    existing.count += 1;
    existing.last = Math.max(existing.last, at);
  } else {
    if (entries.size >= MAX_HOSTS) {
      const oldest = [...entries.entries()].sort(
        (a, b) => a[1].last - b[1].last
      )[0];
      if (oldest) {
        entries.delete(oldest[0]);
      }
    }
    entries.set(key, { host, port, source, first: at, last: at, count: 1 });
  }
  for (const listener of listeners) {
    listener();
  }
}

export function getConnections(): Array<NetworkEntry> {
  return [...entries.values()].map(entry => ({ ...entry }));
}

export function clearConnections(): void {
  entries.clear();
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeConnections(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
