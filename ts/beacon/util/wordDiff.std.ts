// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Word-level diff for message edit history. Tokens are words plus the
 * whitespace after them, so joining the parts reproduces each text exactly.
 */

export type DiffPart = Readonly<{
  type: 'same' | 'added' | 'removed';
  text: string;
}>;

const MAX_CELLS = 250_000;

function tokenize(text: string): Array<string> {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

function merge(parts: Array<DiffPart>): Array<DiffPart> {
  const out: Array<DiffPart> = [];
  for (const part of parts) {
    const last = out.at(-1);
    if (last && last.type === part.type) {
      out[out.length - 1] = { type: part.type, text: last.text + part.text };
    } else {
      out.push(part);
    }
  }
  return out;
}

export function diffWords(before: string, after: string): Array<DiffPart> {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > MAX_CELLS) {
    // Too large for a table; show it as a full replacement.
    return merge([
      { type: 'removed', text: before },
      { type: 'added', text: after },
    ]).filter(p => p.text !== '');
  }

  // Longest common subsequence table, filled from the end.
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * cols + j] ?? 0, lcs[i * cols + j + 1] ?? 0);
    }
  }

  const parts: Array<DiffPart> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ type: 'same', text: a[i] ?? '' });
      i += 1;
      j += 1;
    } else if ((lcs[(i + 1) * cols + j] ?? 0) >= (lcs[i * cols + j + 1] ?? 0)) {
      parts.push({ type: 'removed', text: a[i] ?? '' });
      i += 1;
    } else {
      parts.push({ type: 'added', text: b[j] ?? '' });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) {
    parts.push({ type: 'removed', text: a[i] ?? '' });
  }
  for (; j < b.length; j += 1) {
    parts.push({ type: 'added', text: b[j] ?? '' });
  }
  return merge(parts);
}
