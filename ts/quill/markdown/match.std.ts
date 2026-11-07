// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Inline-markdown detection for the composer. Signal's message formats are
 * bold, italic, strikethrough, monospace and spoiler; each has a markdown
 * spelling here. Called with the text before the cursor right after a
 * keystroke: if that keystroke closed a span, returns where it is.
 */

export type MarkdownStyle =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'monospace'
  | 'spoiler';

export type MarkdownMatch = {
  style: MarkdownStyle;
  /** Index of the opening delimiter. */
  openStart: number;
  /** Index of the closing delimiter (it ends at the cursor). */
  closeStart: number;
  delimiterLength: number;
};

type Rule = { style: MarkdownStyle; delimiter: string };

// Longer delimiters first so `**x**` is bold, not italic.
export const MARKDOWN_RULES: ReadonlyArray<Rule> = [
  { style: 'bold', delimiter: '**' },
  { style: 'spoiler', delimiter: '||' },
  { style: 'strike', delimiter: '~~' },
  { style: 'monospace', delimiter: '`' },
  { style: 'italic', delimiter: '*' },
  { style: 'italic', delimiter: '_' },
  { style: 'strike', delimiter: '~' },
];

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
const isWordChar = (ch: string | undefined) =>
  ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function matchRule(text: string, rule: Rule): MarkdownMatch | undefined {
  const { delimiter } = rule;
  const d = delimiter.length;
  if (!text.endsWith(delimiter)) {
    return undefined;
  }
  const closeStart = text.length - d;
  const delimChar = delimiter[0];
  const lineStart = text.lastIndexOf('\n', closeStart - 1) + 1;

  const beforeClose = text[closeStart - 1];
  if (beforeClose === undefined || closeStart <= lineStart) {
    return undefined;
  }
  // `**bold*` must not close as italic, `~~x~` not as single-tilde strike.
  if (beforeClose === delimChar) {
    return undefined;
  }
  // No space right inside the closing delimiter (except in code spans).
  if (rule.style !== 'monospace' && isSpace(beforeClose)) {
    return undefined;
  }

  let searchFrom = closeStart - 1;
  while (searchFrom >= lineStart) {
    const openStart = text.lastIndexOf(delimiter, searchFrom - d + 1);
    if (openStart < lineStart) {
      return undefined;
    }
    const innerStart = openStart + d;
    const inner = text.slice(innerStart, closeStart);
    const beforeOpen = text[openStart - 1];
    const afterOpen = text[innerStart];

    const valid =
      inner.length > 0 &&
      beforeOpen !== delimChar &&
      afterOpen !== delimChar &&
      (rule.style === 'monospace' || !isSpace(afterOpen)) &&
      // Opening delimiter starts a word: not "snake_case" or "2*3*4".
      !isWordChar(beforeOpen) &&
      (d > 1 || !inner.includes(delimiter));

    if (valid) {
      return {
        style: rule.style,
        openStart,
        closeStart,
        delimiterLength: d,
      };
    }
    searchFrom = openStart - 1;
  }
  return undefined;
}

export function findInlineMarkdown(
  textBeforeCursor: string
): MarkdownMatch | undefined {
  for (const rule of MARKDOWN_RULES) {
    const match = matchRule(textBeforeCursor, rule);
    if (match) {
      return match;
    }
  }
  return undefined;
}
