// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { findInlineMarkdown } from '../../quill/markdown/match.std.ts';
import { diffWords } from '../../beacon/util/wordDiff.std.ts';

const styleOf = (text: string) => findInlineMarkdown(text)?.style;

describe('beacon inline markdown', () => {
  it('recognises every Signal style', () => {
    assert.strictEqual(styleOf('hi **there**'), 'bold');
    assert.strictEqual(styleOf('hi *there*'), 'italic');
    assert.strictEqual(styleOf('hi _there_'), 'italic');
    assert.strictEqual(styleOf('hi ~~there~~'), 'strike');
    assert.strictEqual(styleOf('hi ~there~'), 'strike');
    assert.strictEqual(styleOf('hi `there`'), 'monospace');
    assert.strictEqual(styleOf('hi ||there||'), 'spoiler');
  });

  it('reports the span positions', () => {
    assert.deepEqual(findInlineMarkdown('a **bc**'), {
      style: 'bold',
      openStart: 2,
      closeStart: 6,
      delimiterLength: 2,
    });
  });

  it('waits for the second star of bold', () => {
    assert.isUndefined(findInlineMarkdown('**bold*'));
    assert.isUndefined(findInlineMarkdown('~~gone~'));
  });

  it('ignores things that are not formatting', () => {
    assert.isUndefined(findInlineMarkdown('snake_case_name'));
    assert.isUndefined(findInlineMarkdown('2*3*'));
    assert.isUndefined(findInlineMarkdown('a * b *'));
    assert.isUndefined(findInlineMarkdown('* not *'));
    assert.isUndefined(findInlineMarkdown('****'));
    assert.isUndefined(findInlineMarkdown('``'));
    assert.isUndefined(findInlineMarkdown('*across\nlines*'));
  });

  it('allows spaces inside code', () => {
    assert.strictEqual(styleOf('run ` ls -la `'), 'monospace');
  });

  it('works after emoji and mentions (embed placeholders)', () => {
    assert.strictEqual(styleOf('￼ *hey*'), 'italic');
  });
});

describe('beacon word diff', () => {
  it('marks added and removed words and keeps both texts', () => {
    const parts = diffWords('see you at 5 tomorrow', 'see you at 6 tomorrow!');
    const before = parts
      .filter(p => p.type !== 'added')
      .map(p => p.text)
      .join('');
    const after = parts
      .filter(p => p.type !== 'removed')
      .map(p => p.text)
      .join('');
    assert.strictEqual(before, 'see you at 5 tomorrow');
    assert.strictEqual(after, 'see you at 6 tomorrow!');
    assert.deepEqual(
      parts.filter(p => p.type !== 'same').map(p => [p.type, p.text]),
      [
        ['removed', '5 tomorrow'],
        ['added', '6 tomorrow!'],
      ]
    );
  });

  it('handles empty sides', () => {
    assert.deepEqual(diffWords('', 'hi'), [{ type: 'added', text: 'hi' }]);
    assert.deepEqual(diffWords('hi', ''), [{ type: 'removed', text: 'hi' }]);
    assert.deepEqual(diffWords('same', 'same'), [
      { type: 'same', text: 'same' },
    ]);
  });
});
