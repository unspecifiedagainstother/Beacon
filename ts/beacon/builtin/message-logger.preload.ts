// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { saveBeaconExport } from '../core/exports.dom.ts';
import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import { ICON_MESSAGE_LOGGER } from '../addons/icons.std.ts';
import type { BeaconMessageLogEntry } from '../features.std.ts';
import type { ReadonlyMessageAttributesType } from '../../model-types.d.ts';
import {
  createDeletedSnapshot,
  describeSnapshot,
} from '../core/message-snapshot.std.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { DataReader } from '../../sql/Client.preload.ts';

const STORAGE_KEY = 'beaconMessageLog';
const SAVE_DEBOUNCE_MS = 1000;

type Tab = 'deleted' | 'edited';

function getConversationTitle(conversationId: string): string {
  return (
    window.ConversationController.get(conversationId)?.getTitle() ??
    'Unknown chat'
  );
}

function getAuthorTitle(message: ReadonlyMessageAttributesType): string {
  if (message.type === 'outgoing') {
    return 'You';
  }
  const author = message.sourceServiceId
    ? window.ConversationController.get(message.sourceServiceId)
    : undefined;
  return author?.getTitle() ?? getConversationTitle(message.conversationId);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default {
  id: 'message-logger',
  builtin: true,
  icon: ICON_MESSAGE_LOGGER,
  name: 'Message Logger',
  version: '3.0.0',
  description:
    'Keeps deleted messages readable and logs edits. Retained content is stored in the encrypted database.',
  authors: ['Beacon'],
  tags: ['chat', 'privacy'],
  settings: [
    {
      key: 'showInline',
      type: 'toggle',
      label: 'Show deleted content in chat',
      description:
        'Render what a deleted message said under the "deleted" notice.',
      defaultValue: true,
    },
    {
      key: 'style',
      type: 'select',
      label: 'Deleted message style',
      defaultValue: 'tint',
      options: [
        { label: 'Red bubble', value: 'tint' },
        { label: 'Red bubble, struck through', value: 'strike' },
        { label: 'Red bubble, dimmed text', value: 'subtle' },
      ],
    },
    {
      key: 'logOwn',
      type: 'toggle',
      label: 'Keep my own deleted messages',
      description:
        'Off by default: when you delete something, it is usually on purpose.',
      defaultValue: false,
    },
    {
      key: 'logEdits',
      type: 'toggle',
      label: 'Index edits',
      description: 'List edited messages in the log viewer.',
      defaultValue: true,
    },
    {
      key: 'maxEntries',
      type: 'number',
      label: 'Log size',
      description: 'Oldest index entries are dropped past this many.',
      defaultValue: 2000,
      min: 100,
      max: 20000,
    },
  ],

  start(ctx) {
    let entries: Array<BeaconMessageLogEntry> = [
      ...itemStorage.get(STORAGE_KEY, []),
    ];
    let saveTimer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = undefined;
        void itemStorage.put(STORAGE_KEY, entries);
      }, SAVE_DEBOUNCE_MS);
    };
    ctx.onDispose(() => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        void itemStorage.put(STORAGE_KEY, entries);
      }
    });

    const record = (entry: BeaconMessageLogEntry) => {
      entries = entries.filter(
        e => !(e.messageId === entry.messageId && e.kind === entry.kind)
      );
      entries.push(entry);
      const max = ctx.settings.get<number>('maxEntries');
      if (entries.length > max) {
        entries = entries.slice(entries.length - max);
      }
      save();
    };

    let classDisposers: Array<() => void> = [];
    const applyClasses = () => {
      classDisposers.forEach(dispose => dispose());
      classDisposers = [];
      if (ctx.settings.get<boolean>('showInline')) {
        classDisposers.push(ctx.css.bodyClass('Beacon--logger-show-deleted'));
      }
      classDisposers.push(
        ctx.css.bodyClass(
          `Beacon--logger-style-${ctx.settings.get<string>('style')}`
        )
      );
    };
    applyClasses();
    ctx.settings.onChange(key => {
      if (key === 'showInline' || key === 'style') {
        applyClasses();
      }
    });

    ctx.filters.add(
      'message.deleteForEveryone',
      (props, { message, isAdminDelete }) => {
        if (
          message.type === 'outgoing' &&
          !ctx.settings.get<boolean>('logOwn')
        ) {
          return props;
        }
        const snapshot = createDeletedSnapshot(message, {
          byAdmin: isAdminDelete,
        });
        if (!snapshot) {
          return props;
        }
        record({
          kind: 'deleted',
          messageId: message.id,
          conversationId: message.conversationId,
          at: snapshot.deletedAt,
          sentAt: message.sent_at,
        });
        return { ...props, beaconDeleted: snapshot };
      }
    );

    ctx.hooks.on('onMessageEdited', (message, { conversationId }) => {
      if (!ctx.settings.get<boolean>('logEdits')) {
        return;
      }
      if (message.type === 'outgoing' && !ctx.settings.get<boolean>('logOwn')) {
        return;
      }
      record({
        kind: 'edited',
        messageId: message.id,
        conversationId,
        at: Date.now(),
        sentAt: message.sent_at,
      });
    });

    ctx.hooks.on('onMessageDeleted', ({ id }) => {
      const before = entries.length;
      entries = entries.filter(e => e.messageId !== id);
      if (entries.length !== before) {
        save();
      }
    });

    const openViewer = (initialTab: Tab = 'deleted') => {
      openLogViewer(
        ctx,
        () => entries,
        initialTab,
        cleared => {
          entries = cleared;
          save();
        }
      );
    };

    ctx.keybinds.register('mod+alt+g', () => openViewer());

    ctx.commands.register({
      id: 'messagelog',
      name: 'Message log',
      usage: '[deleted|edited]',
      description: 'Open the deleted/edited message log',
      execute: cmd =>
        openViewer(cmd.args[0] === 'edited' ? 'edited' : 'deleted'),
    });

    ctx.commands.register({
      id: 'exportlog',
      name: 'Export message log',
      description: 'Save the message log as JSON',
      execute: async cmd => {
        const rows = await loadRows(entries);
        const data = rows.map(row => ({
          kind: row.entry.kind,
          chat: getConversationTitle(row.entry.conversationId),
          author: row.message ? getAuthorTitle(row.message) : undefined,
          sentAt: new Date(row.entry.sentAt).toISOString(),
          loggedAt: new Date(row.entry.at).toISOString(),
          content: row.message ? contentFor(row.entry.kind, row.message) : [],
        }));
        const saved = await saveBeaconExport({
          basename: `beacon-message-log-${new Date().toISOString().slice(0, 10)}`,
          label: 'Beacon message log',
          data,
        });
        if (saved) {
          cmd.reply(`Exported ${data.length} entries`, 'success');
        }
      },
    });

    ctx.commands.register({
      id: 'clearlog',
      name: 'Clear message log',
      description: 'Forget the log index (retained message content stays)',
      execute: cmd => {
        entries = [];
        save();
        cmd.reply('Message log cleared', 'success');
      },
    });
  },
} satisfies AddonManifest;

type Row = {
  entry: BeaconMessageLogEntry;
  message: ReadonlyMessageAttributesType | undefined;
};

async function loadRows(
  entries: ReadonlyArray<BeaconMessageLogEntry>
): Promise<Array<Row>> {
  const ids = Array.from(new Set(entries.map(e => e.messageId)));
  const byId = new Map<string, ReadonlyMessageAttributesType>();

  const missing: Array<string> = [];
  for (const id of ids) {
    const cached = window.MessageCache.getById(id);
    if (cached) {
      byId.set(id, cached.attributes);
    } else {
      missing.push(id);
    }
  }
  if (missing.length) {
    const fetched = await DataReader.getMessagesById(missing);
    for (const message of fetched) {
      byId.set(message.id, message);
    }
  }

  return entries
    .map(entry => ({ entry, message: byId.get(entry.messageId) }))
    .reverse(); // newest first
}

function contentFor(
  kind: Tab,
  message: ReadonlyMessageAttributesType
): Array<string> {
  if (kind === 'deleted') {
    const snapshot = message.beaconDeleted;
    if (!snapshot) {
      return [];
    }
    return [
      ...(snapshot.previousRevisions ?? []).map(r => r.body ?? ''),
      describeSnapshot(snapshot),
    ].filter(Boolean);
  }
  return (message.editHistory ?? [])
    .map(edit => edit.body ?? '')
    .reverse()
    .filter(Boolean);
}

function openLogViewer(
  ctx: AddonContext,
  getEntries: () => ReadonlyArray<BeaconMessageLogEntry>,
  initialTab: Tab,
  onClear: (remaining: Array<BeaconMessageLogEntry>) => void
): void {
  const el = (tag: string, className?: string, text?: string) =>
    ctx.ui.createElement({ tag, className, text });

  let tab: Tab = initialTab;
  let query = '';
  let rows: Array<Row> = [];

  const root = el('div', 'BeaconLog');
  const toolbar = el('div', 'BeaconLog__toolbar');
  const tabs = el('div', 'BeaconSegmented');
  const search = ctx.ui.createElement({
    tag: 'input',
    className: 'BeaconInput BeaconLog__search',
    attrs: {
      type: 'search',
      placeholder: 'Search log…',
      'aria-label': 'Search log',
    },
  }) as HTMLInputElement;
  const list = el('div', 'BeaconLog__list');
  toolbar.append(tabs, search);
  root.append(toolbar, list);

  const selectTab = (value: Tab) => {
    tab = value;
    render();
  };
  const tabButtons = new Map<Tab, HTMLElement>();
  (['deleted', 'edited'] as const).forEach(value => {
    const btn = ctx.ui.createElement({
      tag: 'button',
      className: 'BeaconSegmented__item',
      attrs: { type: 'button' },
      onClick: () => selectTab(value),
    });
    tabButtons.set(value, btn);
    tabs.append(btn);
  });

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });

  function render() {
    for (const [value, btn] of tabButtons) {
      const count = rows.filter(r => r.entry.kind === value).length;
      btn.textContent = `${value === 'deleted' ? 'Deleted' : 'Edited'} (${count})`;
      btn.classList.toggle('BeaconSegmented__item--active', value === tab);
    }

    const visible = rows.filter(row => {
      if (row.entry.kind !== tab) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        getConversationTitle(row.entry.conversationId),
        row.message ? getAuthorTitle(row.message) : '',
        ...(row.message ? contentFor(row.entry.kind, row.message) : []),
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(query);
    });

    if (visible.length === 0) {
      let emptyText =
        tab === 'deleted'
          ? 'No deleted messages logged yet. Messages are kept from the moment the logger is on; ones deleted earlier — including messages already deleted when your phone transferred history — never reached Beacon with their content.'
          : 'No edits logged yet. Edits are logged as they arrive.';
      if (query) {
        emptyText = 'Nothing matches.';
      }
      list.replaceChildren(el('div', 'BeaconEmpty', emptyText));
      return;
    }

    list.replaceChildren(
      ...visible.map(row => {
        const card = el('div', `BeaconLog__item BeaconLog__item--${tab}`);
        const head = el('div', 'BeaconLog__item-head');
        head.append(
          el(
            'span',
            'BeaconLog__item-author',
            row.message ? getAuthorTitle(row.message) : 'Unknown'
          ),
          el(
            'span',
            'BeaconLog__item-chat',
            `in ${getConversationTitle(row.entry.conversationId)}`
          ),
          el('span', 'BeaconLog__item-time', formatTime(row.entry.at))
        );

        const body = el('div', 'BeaconLog__item-body');
        const lines = row.message
          ? contentFor(row.entry.kind, row.message)
          : [];
        if (lines.length === 0) {
          body.append(
            el(
              'div',
              'BeaconLog__line BeaconLog__line--gone',
              'Content unavailable'
            )
          );
        }
        lines.forEach((line, idx) => {
          const isLast = idx === lines.length - 1;
          let label: string;
          if (isLast) {
            label = tab === 'deleted' ? 'Deleted' : 'Current';
          } else {
            label = idx === 0 ? 'Original' : `Edit ${idx}`;
          }
          const lineEl = el(
            'div',
            classNames(
              'BeaconLog__line',
              !isLast && 'BeaconLog__line--old',
              isLast && tab === 'deleted' && 'BeaconLog__line--deleted'
            )
          );
          lineEl.append(
            el('span', 'BeaconLog__line-label', label),
            el(
              'span',
              'BeaconLog__line-text',
              line.trim().replace(/\n{3,}/g, '\n\n')
            )
          );
          body.append(lineEl);
        });

        const jump = ctx.ui.createElement({
          tag: 'button',
          className: 'BeaconButton BeaconButton--ghost BeaconLog__jump',
          text: 'Jump',
          attrs: { type: 'button' },
          onClick: () => {
            window.reduxActions.conversations.showConversation({
              conversationId: row.entry.conversationId,
              messageId: row.entry.messageId,
            });
            modal.close();
          },
        });
        head.append(jump);

        card.append(head, body);
        return card;
      })
    );
  }

  const modal = ctx.ui.createModal({
    title: 'Message log',
    content: root,
    size: 'wide',
    actions: [
      {
        label: 'Clear this tab',
        variant: 'destructive',
        onClick: () => {
          const remaining = getEntries().filter(e => e.kind !== tab);
          onClear(remaining);
          rows = rows.filter(r => r.entry.kind !== tab);
          render();
        },
      },
    ],
  });

  list.append(el('div', 'BeaconEmpty', 'Loading…'));
  void (async () => {
    try {
      rows = await loadRows(getEntries());
    } catch (error) {
      ctx.error('failed to load log rows', error);
      rows = [];
    }
    render();
    search.focus();
  })();
}

function classNames(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(' ');
}
