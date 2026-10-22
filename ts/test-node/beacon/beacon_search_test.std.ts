// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  matchesFilters,
  parseSearchFilters,
} from '../../beacon/util/searchFilters.std.ts';

const NOW = new Date(2026, 9, 22, 15, 0, 0).getTime();

describe('beacon search filters', () => {
  it('parses filters and leaves the text', () => {
    const f = parseSearchFilters(
      'pizza from:alice has:link before:2026-10-01',
      NOW
    );
    assert.strictEqual(f.text, 'pizza');
    assert.strictEqual(f.from, 'alice');
    assert.deepEqual(f.has, ['link']);
    assert.strictEqual(f.before, new Date(2026, 9, 1).getTime());
  });

  it('supports quoted names, today/yesterday and unknown words', () => {
    const f = parseSearchFilters(
      'from:"Alice Smith" after:yesterday has:nope',
      NOW
    );
    assert.strictEqual(f.from, 'alice smith');
    assert.strictEqual(f.after, new Date(2026, 9, 21).getTime());
    assert.strictEqual(f.text, 'has:nope');
  });

  it('matches messages', () => {
    const f = parseSearchFilters('from:ali has:image', NOW);
    const name = () => 'Alice';
    assert.isTrue(
      matchesFilters(
        { type: 'incoming', attachments: [{ contentType: 'image/png' }] },
        f,
        name
      )
    );
    assert.isFalse(
      matchesFilters({ type: 'incoming', attachments: [] }, f, name)
    );
    assert.isTrue(
      matchesFilters(
        { type: 'outgoing', body: 'see https://example.com' },
        parseSearchFilters('from:me has:link', NOW),
        name
      )
    );
  });

  it('applies date bounds', () => {
    const f = parseSearchFilters('after:2026-10-01 before:2026-10-10', NOW);
    const at = (d: number) => ({ sent_at: new Date(2026, 9, d, 12).getTime() });
    assert.isFalse(matchesFilters(at(1), f, () => ''));
    assert.isTrue(matchesFilters(at(5), f, () => ''));
    assert.isFalse(matchesFilters(at(10), f, () => ''));
  });
});
