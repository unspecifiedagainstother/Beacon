// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  addBeaconFilter,
  applyBeaconFilter,
  filterCount,
} from '../../beacon/core/filters.std.ts';
import { AddonSettingsStore } from '../../beacon/core/settings.std.ts';
import { HookBus } from '../../beacon/core/hook-bus.std.ts';
import { createPatcher } from '../../beacon/core/patcher.std.ts';
import {
  createDeletedSnapshot,
  describeSnapshot,
} from '../../beacon/core/message-snapshot.std.ts';
import {
  cleanUrlsInText,
  DEFAULT_TRACKING_PARAMS,
  toParamMatchers,
} from '../../beacon/util/clearUrls.std.ts';

const notificationContext = {
  conversationId: 'c',
  messageId: 'm',
  message: 'hello',
  senderTitle: 'Alice',
  type: 'Message',
};

describe('Beacon core', () => {
  describe('filters', () => {
    it('passes values through registered filters in order', () => {
      const disposeA = addBeaconFilter('notification.show', show => show);
      const disposeB = addBeaconFilter('notification.show', () => false);
      try {
        assert.isFalse(
          applyBeaconFilter('notification.show', true, notificationContext)
        );
      } finally {
        disposeA();
        disposeB();
      }
      assert.strictEqual(filterCount('notification.show'), 0);
    });

    it('keeps the value when a filter returns undefined or throws', () => {
      const disposeA = addBeaconFilter('notification.show', () => undefined);
      const disposeB = addBeaconFilter('notification.show', () => {
        throw new Error('broken addon');
      });
      try {
        assert.isTrue(
          applyBeaconFilter('notification.show', true, notificationContext)
        );
      } finally {
        disposeA();
        disposeB();
      }
    });
  });

  describe('AddonSettingsStore', () => {
    it('returns defaults, coerces values, and notifies listeners', () => {
      const store = new AddonSettingsStore();
      store.define('a', [
        { key: 'on', type: 'toggle', label: 'On', defaultValue: true },
        {
          key: 'n',
          type: 'number',
          label: 'N',
          defaultValue: 5,
          min: 1,
          max: 10,
        },
        {
          key: 's',
          type: 'select',
          label: 'S',
          defaultValue: 'x',
          options: [
            { label: 'X', value: 'x' },
            { label: 'Y', value: 'y' },
          ],
        },
      ]);

      assert.deepEqual(store.getAll('a'), { on: true, n: 5, s: 'x' });

      const seen: Array<[string, unknown]> = [];
      const unsubscribe = store.subscribe((_id, key, value) =>
        seen.push([key, value])
      );
      store.set('a', 'n', 99);
      store.set('a', 's', 'nope');
      store.set('a', 'on', false);
      unsubscribe();

      assert.strictEqual(store.get('a', 'n'), 10, 'clamped to max');
      assert.strictEqual(store.get('a', 's'), 'x', 'invalid option rejected');
      assert.isFalse(store.get('a', 'on'));
      assert.deepEqual(seen, [
        ['n', 10],
        ['s', 'x'],
        ['on', false],
      ]);

      store.reset('a');
      assert.deepEqual(store.getAll('a'), { on: true, n: 5, s: 'x' });
    });
  });

  describe('HookBus', () => {
    it('isolates throwing handlers', () => {
      const bus = new HookBus();
      let called = false;
      bus.on('onConversationSelected', () => {
        throw new Error('boom');
      });
      bus.on('onConversationSelected', () => {
        called = true;
      });
      bus.emit('onConversationSelected', 'abc');
      assert.isTrue(called);
    });
  });

  describe('patcher', () => {
    it('stacks patches and restores the original when all are removed', () => {
      const target = {
        greet(name: string) {
          return `hi ${name}`;
        },
      };
      const original = target.greet;
      const a = createPatcher();
      const b = createPatcher();

      a.before(target, 'greet', args => [String(args[0]).toUpperCase()]);
      b.after(target, 'greet', result => `${String(result)}!`);
      assert.strictEqual(target.greet('bob'), 'hi BOB!');

      a.unpatchAll();
      assert.strictEqual(target.greet('bob'), 'hi bob!');

      b.unpatchAll();
      assert.strictEqual(target.greet, original);
    });

    it('does not let a throwing before-patch break the call', () => {
      const target = { add: (x: number, y: number) => x + y };
      const p = createPatcher();
      p.before(target, 'add', () => {
        throw new Error('broken addon');
      });
      assert.strictEqual(target.add(1, 2), 3);
      p.unpatchAll();
    });
  });

  describe('message snapshot', () => {
    it('captures body, attachments and earlier revisions', () => {
      const snapshot = createDeletedSnapshot(
        {
          body: 'final',
          attachments: [{ contentType: 'image/png', fileName: 'cat.png' }],
          editHistory: [
            { body: 'final', timestamp: 3 },
            { body: 'second', timestamp: 2 },
            { body: 'first', timestamp: 1 },
          ],
        },
        { byAdmin: false, now: 42 }
      );
      assert.isDefined(snapshot);
      assert.strictEqual(snapshot?.deletedAt, 42);
      assert.deepEqual(
        snapshot?.previousRevisions?.map(r => r.body),
        ['first', 'second']
      );
      assert.strictEqual(
        snapshot && describeSnapshot(snapshot),
        'final [cat.png]'
      );
    });

    it('returns undefined for an empty message', () => {
      assert.isUndefined(createDeletedSnapshot({}, { byAdmin: false }));
    });
  });

  describe('clearUrls', () => {
    const matchers = toParamMatchers(DEFAULT_TRACKING_PARAMS);

    it('removes tracking params and keeps the rest', () => {
      assert.strictEqual(
        cleanUrlsInText(
          'look https://example.com/a?id=7&utm_source=x&fbclid=y now',
          matchers
        ),
        'look https://example.com/a?id=7 now'
      );
    });

    it('keeps trailing punctuation outside the URL', () => {
      assert.strictEqual(
        cleanUrlsInText('see https://youtu.be/abc?si=123.', matchers),
        'see https://youtu.be/abc.'
      );
    });

    it('leaves clean URLs byte-for-byte untouched', () => {
      const text = 'https://example.com/path?q=a%20b';
      assert.strictEqual(cleanUrlsInText(text, matchers), text);
    });
  });
});
