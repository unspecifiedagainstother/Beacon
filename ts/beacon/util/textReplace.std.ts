// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Rule parsing for the text-replace addon.
 *
 * One rule per line, `find => replace`. `find` is literal text, or a regex
 * written as `/pattern/flags`. Blank lines and lines starting with `#` are
 * ignored. In regex rules `$1`… refer to capture groups.
 */

export type ReplaceRule = {
  source: string;
  apply: (text: string) => string;
};

export type ParseResult = {
  rules: Array<ReplaceRule>;
  errors: Array<string>;
};

const SEPARATOR = '=>';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseReplaceRules(source: string): ParseResult {
  const rules: Array<ReplaceRule> = [];
  const errors: Array<string> = [];

  source.split('\n').forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      return;
    }
    const sep = line.indexOf(SEPARATOR);
    if (sep <= 0) {
      errors.push(`line ${idx + 1}: expected "find => replace"`);
      return;
    }
    const find = line.slice(0, sep).trim();
    const replace = line.slice(sep + SEPARATOR.length).trim();

    const regexLiteral = /^\/(.+)\/([a-z]*)$/i.exec(find);
    let re: RegExp;
    try {
      if (regexLiteral) {
        const [, pattern = '', rawFlags = ''] = regexLiteral;
        const flags = rawFlags.includes('g') ? rawFlags : `${rawFlags}g`;
        re = new RegExp(pattern, flags);
      } else {
        re = new RegExp(escapeRegExp(find), 'g');
      }
    } catch (error) {
      errors.push(
        `line ${idx + 1}: ${error instanceof Error ? error.message : 'bad regex'}`
      );
      return;
    }

    rules.push({
      source: line,
      // Literal rules must not interpret `$` in the replacement.
      apply: regexLiteral
        ? text => text.replace(re, replace)
        : text => text.replace(re, () => replace),
    });
  });

  return { rules, errors };
}

export function applyReplaceRules(
  text: string,
  rules: ReadonlyArray<ReplaceRule>
): string {
  return rules.reduce((acc, rule) => rule.apply(acc), text);
}
