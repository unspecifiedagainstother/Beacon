// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

export type CssTokenKind =
  | 'comment'
  | 'string'
  | 'at-rule'
  | 'selector'
  | 'property'
  | 'value'
  | 'number'
  | 'color'
  | 'important'
  | 'punctuation'
  | 'space';

export type CssToken = { kind: CssTokenKind; text: string };

const RULES: Array<[RegExp, CssTokenKind | 'word']> = [
  [/^\/\*[\s\S]*?(?:\*\/|$)/, 'comment'],
  [/^"(?:\\.|[^"\\\n])*"?/, 'string'],
  [/^'(?:\\.|[^'\\\n])*'?/, 'string'],
  [/^@[\w-]+/, 'at-rule'],
  [/^!important\b/i, 'important'],
  [/^#[0-9a-f]{3,8}\b/i, 'color'],
  [/^-?(?:\d+\.?\d*|\.\d+)(?:%|[a-z]+)?/i, 'number'],
  [/^\s+/, 'space'],
  [/^[{}:;,()]/, 'punctuation'],
  [/^[^\s{}:;,()"'/]+|^\//, 'word'],
];

export function tokenizeCss(source: string): Array<CssToken> {
  const tokens: Array<CssToken> = [];
  let depth = 0;
  let inValue = false;
  let rest = source;

  const push = (kind: CssTokenKind, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && kind !== 'punctuation') {
      last.text += text;
    } else {
      tokens.push({ kind, text });
    }
  };

  while (rest.length > 0) {
    let matched = false;
    for (const [re, rawKind] of RULES) {
      const m = re.exec(rest);
      if (!m || m[0].length === 0) {
        continue;
      }
      const text = m[0];
      let kind: CssTokenKind;

      if (rawKind === 'punctuation') {
        kind = 'punctuation';
        if (text === '{') {
          depth += 1;
          inValue = false;
        } else if (text === '}') {
          depth = Math.max(0, depth - 1);
          inValue = false;
        } else if (text === ';') {
          inValue = false;
        } else if (text === ':' && depth > 0 && !inValue) {
          const statement = rest.slice(0, rest.search(/[;}]|$/));
          if (!statement.includes('{')) {
            inValue = true;
          }
        }
      } else if (rawKind === 'word') {
        if (depth === 0) {
          kind = 'selector';
        } else if (inValue) {
          kind = 'value';
        } else {
          const statement = rest.slice(0, rest.search(/[;}]|$/));
          kind = statement.includes('{') ? 'selector' : 'property';
        }
      } else if ((rawKind === 'number' || rawKind === 'color') && !inValue) {
        kind =
          depth === 0 || rest.slice(0, rest.search(/[;}]|$/)).includes('{')
            ? 'selector'
            : 'property';
      } else {
        kind = rawKind;
      }

      push(kind, text);
      rest = rest.slice(text.length);
      matched = true;
      break;
    }
    if (!matched) {
      push(depth === 0 ? 'selector' : 'value', rest[0] ?? '');
      rest = rest.slice(1);
    }
  }

  return tokens;
}
