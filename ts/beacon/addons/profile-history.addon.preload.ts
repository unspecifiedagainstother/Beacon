// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Profile History — keeps a local record of every profile change Beacon
 * sees: profile names, usernames, about text, avatars (with thumbnails),
 * phone numbers, and optionally group names/descriptions and the names you
 * saved for contacts.
 *
 * Storage: items storage, i.e. the encrypted SQLCipher database — never
 * localStorage. Removed on unlink.
 *
 * How changes are seen:
 *  - live: every Redux update to a conversation is diffed against the last
 *    known values (the "baseline");
 *  - at launch: the baseline is compared with what the app loaded, so
 *    changes made while Beacon was closed are recorded too, marked
 *    "noticed at launch".
 * Profiles only change here when Signal fetches them, so the time recorded
 * is when Beacon learned of the change, not when the person made it.
 */

import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import type {
  BeaconProfileChange,
  BeaconProfileField,
} from '../features.std.ts';
import type { ConversationType } from '../../state/ducks/conversations.preload.ts';
import { ICON_PROFILE_HISTORY } from './icons.std.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { drop } from '../../util/drop.std.ts';

const HISTORY_KEY = 'beaconProfileHistory';
const BASELINE_KEY = 'beaconProfileBaseline';
const SAVE_DEBOUNCE_MS = 1500;
const THUMB_SIZE = 64;
const SEED_INTERVAL_MS = 400;

const FIELD_LABELS: Record<BeaconProfileField, string> = {
  profileName: 'Profile name',
  username: 'Username',
  about: 'About',
  avatar: 'Avatar',
  phone: 'Phone number',
  contactName: 'Saved name',
  groupName: 'Group name',
  groupDescription: 'Group description',
};

type Values = Partial<Record<BeaconProfileField, string>>;

function joinName(...parts: Array<string | undefined>): string | undefined {
  const joined = parts.filter(Boolean).join(' ').trim();
  return joined || undefined;
}

function avatarIdentity(c: ConversationType): string | undefined {
  return c.avatarHash ?? c.rawAvatarPath ?? c.avatarUrl ?? undefined;
}

function extractValues(
  c: ConversationType,
  opts: { groups: boolean; phone: boolean; contactNames: boolean }
): Values | undefined {
  if (c.type === 'group') {
    if (!opts.groups) {
      return undefined;
    }
    return {
      groupName: c.name ?? undefined,
      groupDescription: c.groupDescription ?? undefined,
      avatar: avatarIdentity(c),
    };
  }
  return {
    profileName: c.profileName ?? joinName(c.firstName, c.familyName),
    username: c.username ?? undefined,
    about: joinName(c.aboutEmoji, c.aboutText ?? c.about),
    avatar: avatarIdentity(c),
    ...(opts.phone ? { phone: c.e164 ?? undefined } : {}),
    ...(opts.contactNames
      ? {
          contactName:
            joinName(c.nicknameGivenName, c.nicknameFamilyName) ??
            joinName(c.systemGivenName, c.systemFamilyName) ??
            c.name ??
            undefined,
        }
      : {}),
  };
}

/** Downscale an avatar to a small JPEG data URL, or undefined if unreadable. */
async function makeThumb(url: string | undefined): Promise<string | undefined> {
  if (!url) {
    return undefined;
  }
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const g = canvas.getContext('2d');
    if (!g) {
      return undefined;
    }
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      THUMB_SIZE,
      THUMB_SIZE
    );
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch {
    // Missing file or a tainted canvas: record the change without pixels.
    return undefined;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default {
  id: 'profile-history',
  icon: ICON_PROFILE_HISTORY,
  name: 'Profile History',
  version: '1.0.0',
  description:
    'Locally records profile changes — names, usernames, about, avatars, numbers. /profilelog to view.',
  authors: ['Beacon'],
  tags: ['privacy', 'utility'],
  settings: [
    {
      key: 'groups',
      type: 'toggle',
      label: 'Track groups',
      description: 'Group names, descriptions and avatars.',
      defaultValue: true,
    },
    {
      key: 'phone',
      type: 'toggle',
      label: 'Track phone numbers',
      defaultValue: true,
    },
    {
      key: 'contactNames',
      type: 'toggle',
      label: 'Track names you saved',
      description: 'Nicknames and system contact names (your own edits).',
      defaultValue: false,
    },
    {
      key: 'thumbnails',
      type: 'toggle',
      label: 'Keep avatar thumbnails',
      description: '64×64 previews of old and new avatars, stored encrypted.',
      defaultValue: true,
    },
    {
      key: 'maxEntries',
      type: 'number',
      label: 'History size',
      defaultValue: 5000,
      min: 100,
      max: 50000,
    },
  ],

  start(ctx) {
    let history: Array<BeaconProfileChange> = [
      ...itemStorage.get(HISTORY_KEY, []),
    ];
    const baseline: Record<string, Partial<Record<string, string>>> = {
      ...itemStorage.get(BASELINE_KEY, {}),
    };
    const isFirstRun = Object.keys(baseline).length === 0;

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      saveTimer = undefined;
      void itemStorage.put(HISTORY_KEY, history);
      void itemStorage.put(BASELINE_KEY, baseline);
    };
    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    };
    ctx.onDispose(() => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        flush();
      }
    });

    const options = () => ({
      groups: ctx.settings.get<boolean>('groups'),
      phone: ctx.settings.get<boolean>('phone'),
      contactNames: ctx.settings.get<boolean>('contactNames'),
    });

    const record = (change: BeaconProfileChange) => {
      history.push(change);
      const max = ctx.settings.get<number>('maxEntries');
      if (history.length > max) {
        history = history.slice(history.length - max);
      }
      save();
    };

    const diff = async (
      c: ConversationType,
      source: BeaconProfileChange['source']
    ) => {
      if (c.isMe) {
        return;
      }
      const values = extractValues(c, options());
      if (!values) {
        return;
      }
      const known = baseline[c.id];
      if (!known) {
        // First sighting: remember, don't report.
        baseline[c.id] = { ...values };
        save();
        return;
      }

      for (const field of Object.keys(values) as Array<BeaconProfileField>) {
        const next = values[field];
        const prev = known[field];
        if (next === prev || (next == null && prev == null)) {
          continue;
        }
        // A field we did not track before is a baseline gap, not a change.
        if (!(field in known)) {
          known[field] = next;
          continue;
        }

        if (field === 'avatar') {
          const withThumbs = ctx.settings.get<boolean>('thumbnails');
          // oxlint-disable-next-line no-await-in-loop
          const toThumb = withThumbs ? await makeThumb(c.avatarUrl) : undefined;
          record({
            conversationId: c.id,
            field,
            at: Date.now(),
            from: prev ? 'avatar' : undefined,
            to: next ? 'avatar' : undefined,
            fromThumb: withThumbs ? known.avatarThumb : undefined,
            toThumb,
            source,
          });
          known.avatarThumb = toThumb;
        } else {
          record({
            conversationId: c.id,
            field,
            at: Date.now(),
            from: prev,
            to: next,
            source,
          });
        }
        known[field] = next;
      }
      save();
    };

    // -- Launch: compare what the app loaded against the stored baseline.
    const lookup = () => ctx.redux.getState().conversations.conversationLookup;
    void (async () => {
      for (const c of Object.values(lookup())) {
        if (isFirstRun) {
          const values = extractValues(c, options());
          if (values && !c.isMe) {
            baseline[c.id] = { ...values };
          }
        } else {
          // oxlint-disable-next-line no-await-in-loop
          await diff(c, 'startup');
        }
      }
      save();
    })();

    // -- Live: diff conversations whose Redux object changed.
    ctx.redux.observe(
      state => state.conversations.conversationLookup,
      (next, prev) => {
        for (const [id, c] of Object.entries(next)) {
          if (c !== prev[id]) {
            void diff(c, 'live');
          }
        }
      }
    );

    // -- Background: seed avatar thumbnails so the first change has a "before".
    let seedTimer: ReturnType<typeof setTimeout> | undefined;
    const seedQueue = Object.values(lookup())
      .filter(c => c.avatarUrl && !baseline[c.id]?.avatarThumb)
      .map(c => c.id);
    const seedNext = async () => {
      const id = seedQueue.shift();
      if (!id || !ctx.settings.get<boolean>('thumbnails')) {
        return;
      }
      const c = lookup()[id];
      const known = baseline[id];
      if (c && known && !known.avatarThumb) {
        known.avatarThumb = await makeThumb(c.avatarUrl);
        save();
      }
      seedTimer = setTimeout(() => drop(seedNext()), SEED_INTERVAL_MS);
    };
    seedTimer = setTimeout(() => drop(seedNext()), 5000);
    ctx.onDispose(() => clearTimeout(seedTimer));

    // -- UI
    const open = (filter?: { conversationId?: string; query?: string }) =>
      openViewer(
        ctx,
        () => history,
        () => baseline,
        filter,
        () => {
          history = [];
          save();
        }
      );

    ctx.keybinds.register('mod+alt+p', () => open());
    ctx.commands.register({
      id: 'profilelog',
      name: 'Profile history',
      usage: '[here | name]',
      description: 'Show recorded profile changes',
      execute: cmd => {
        if (cmd.args[0] === 'here' && cmd.conversationId) {
          open({ conversationId: cmd.conversationId });
        } else {
          open({ query: cmd.argsRaw || undefined });
        }
      },
    });
    ctx.filters.add('conversation.menuItems', (items, { conversationId }) => [
      ...items,
      {
        id: 'beacon-profile-history',
        label: 'Profile history',
        symbol: 'person-circle',
        onSelect: () => open({ conversationId }),
      },
    ]);
  },
} satisfies AddonManifest;

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

function openViewer(
  ctx: AddonContext,
  getHistory: () => ReadonlyArray<BeaconProfileChange>,
  getBaseline: () => Readonly<Record<string, Partial<Record<string, string>>>>,
  initial: { conversationId?: string; query?: string } | undefined,
  onClear: () => void
): void {
  const el = (tag: string, className?: string, text?: string) =>
    ctx.ui.createElement({ tag, className, text });

  let query = initial?.query?.toLowerCase() ?? '';
  let field: BeaconProfileField | 'all' = 'all';
  const onlyConversation = initial?.conversationId;

  const root = el('div', 'BeaconLog BeaconProfileLog');
  const toolbar = el('div', 'BeaconLog__toolbar');
  const search = ctx.ui.createElement({
    tag: 'input',
    className: 'BeaconInput BeaconLog__search',
    attrs: {
      type: 'search',
      placeholder: 'Search names, usernames…',
      'aria-label': 'Search profile history',
    },
  }) as HTMLInputElement;
  search.value = initial?.query ?? '';
  const select = ctx.ui.createElement({
    tag: 'select',
    className: 'BeaconInput BeaconInput--select',
    attrs: { 'aria-label': 'Filter by field' },
  }) as HTMLSelectElement;
  select.append(new Option('All changes', 'all'));
  for (const [value, label] of Object.entries(FIELD_LABELS)) {
    select.append(new Option(label, value));
  }
  toolbar.append(search, select);
  const list = el('div', 'BeaconLog__list');
  root.append(toolbar, list);

  const titleOf = (id: string) =>
    window.ConversationController.get(id)?.getTitle() ?? 'Unknown';

  const thumb = (src: string | undefined, fallback: string) => {
    if (src) {
      return ctx.ui.createElement({
        tag: 'img',
        className: 'BeaconProfileLog__thumb',
        attrs: { src, alt: '' },
      });
    }
    return el(
      'span',
      'BeaconProfileLog__thumb BeaconProfileLog__thumb--empty',
      fallback
    );
  };

  function render() {
    const baseline = getBaseline();
    const rows = getHistory()
      .filter(c => !onlyConversation || c.conversationId === onlyConversation)
      .filter(c => field === 'all' || c.field === field)
      .filter(c => {
        if (!query) {
          return true;
        }
        return [titleOf(c.conversationId), c.from ?? '', c.to ?? '']
          .join('\n')
          .toLowerCase()
          .includes(query);
      })
      .slice()
      .reverse();

    if (rows.length === 0) {
      list.replaceChildren(
        el(
          'div',
          'BeaconEmpty',
          getHistory().length
            ? 'Nothing matches.'
            : 'No profile changes recorded yet. Changes are recorded from now on.'
        )
      );
      return;
    }

    list.replaceChildren(
      ...rows.slice(0, 500).map(change => {
        const card = el('div', 'BeaconLog__item BeaconProfileLog__item');
        const head = el('div', 'BeaconLog__item-head');
        head.append(
          thumb(
            baseline[change.conversationId]?.avatarThumb,
            titleOf(change.conversationId).charAt(0)
          ),
          el('span', 'BeaconLog__item-author', titleOf(change.conversationId)),
          el('span', 'BeaconChip', FIELD_LABELS[change.field]),
          el(
            'span',
            'BeaconLog__item-time',
            `${formatTime(change.at)}${change.source === 'startup' ? ' · noticed at launch' : ''}`
          )
        );
        const jump = ctx.ui.createElement({
          tag: 'button',
          className: 'BeaconButton BeaconButton--ghost BeaconLog__jump',
          text: 'Open',
          attrs: { type: 'button' },
          onClick: () => {
            window.reduxActions.conversations.showConversation({
              conversationId: change.conversationId,
            });
            modal.close();
          },
        });
        head.append(jump);

        const body = el('div', 'BeaconProfileLog__change');
        if (change.field === 'avatar') {
          body.append(
            thumb(change.fromThumb, change.from ? '?' : '∅'),
            el('span', 'BeaconProfileLog__arrow', '→'),
            thumb(change.toThumb, change.to ? '?' : '∅')
          );
        } else {
          body.append(
            el('span', 'BeaconProfileLog__from', change.from ?? '(none)'),
            el('span', 'BeaconProfileLog__arrow', '→'),
            el('span', 'BeaconProfileLog__to', change.to ?? '(removed)')
          );
        }
        card.append(head, body);
        return card;
      })
    );
  }

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });
  select.addEventListener('change', () => {
    field = select.value as BeaconProfileField | 'all';
    render();
  });

  const modal = ctx.ui.createModal({
    title: onlyConversation
      ? `Profile history — ${titleOf(onlyConversation)}`
      : 'Profile history',
    content: root,
    size: 'wide',
    actions: [
      {
        label: 'Export',
        onClick: () => {
          const data = getHistory().map(c => ({
            chat: titleOf(c.conversationId),
            field: FIELD_LABELS[c.field],
            from: c.field === 'avatar' ? undefined : c.from,
            to: c.field === 'avatar' ? undefined : c.to,
            at: new Date(c.at).toISOString(),
            source: c.source,
          }));
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(data, null, 2)], {
              type: 'application/json',
            })
          );
          const a = document.createElement('a');
          a.href = url;
          a.download = `beacon-profile-history-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          ctx.ui.showNotification(
            'Exported — the file is NOT encrypted',
            'warning'
          );
        },
      },
      {
        label: 'Clear history',
        variant: 'destructive',
        onClick: () => {
          onClear();
          render();
        },
      },
    ],
  });

  render();
  search.focus();
}
