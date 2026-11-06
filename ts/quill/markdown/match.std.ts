// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type MarkdownStyle =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'monospace'
  | 'spoiler';

export type MarkdownMatch = {
  style: MarkdownStyle;
  openStart: number;
  closeStart: number;
  delimiterLength: number;
};

type Rule = { style: MarkdownStyle; delimiter: string };

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
  if (beforeClose === delimChar) {
    return undefined;
  }
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
