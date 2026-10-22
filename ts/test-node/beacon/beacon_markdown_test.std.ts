// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { findInlineMarkdown } from '../../quill/markdown/match.std.ts';

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
