// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Snippets — saved text you insert with a slash command. Each snippet becomes
 * its own command (so it shows in autocomplete); `/snip` lists them.
 *
 * Settings format, one per line:  name: text   (use \n for a line break)
 */

import type { AddonManifest, Disposer } from '../core/types.dom.ts';
import { ICON_SNIPPETS } from './icons.std.ts';

const EXAMPLE = [
  'addr: 221B Baker Street, London',
  'sig: — sent from Beacon',
].join('\n');

type Snippet = { name: string; text: string };

function parseSnippets(source: string): Array<Snippet> {
  const result: Array<Snippet> = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const sep = line.indexOf(':');
    if (!line || line.startsWith('#') || sep <= 0) {
      continue;
    }
    const name = line.slice(0, sep).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      continue;
    }
    result.push({
      name,
      text: line
        .slice(sep + 1)
        .trim()
        .replace(/\\n/g, '\n'),
    });
  }
  return result;
}

export default {
  id: 'snippets',
  icon: ICON_SNIPPETS,
  name: 'Snippets',
  version: '1.0.0',
  description: 'Saved text you insert with your own slash commands.',
  authors: ['Beacon'],
  tags: ['chat'],
  settings: [
    {
      key: 'snippets',
      type: 'text',
      label: 'Snippets',
      description:
        'name: text — one per line. Names are letters, digits and dashes. Use \\n for a new line.',
      defaultValue: EXAMPLE,
      multiline: true,
    },
  ],

  start(ctx) {
    let registered: Array<Disposer> = [];

    const sync = () => {
      registered.forEach(dispose => dispose());
      registered = [];
      const taken = new Set(
        ctx.commands
          .list()
          .filter(cmd => cmd.addonId !== ctx.id)
          .map(cmd => cmd.id)
      );
      for (const snippet of parseSnippets(
        ctx.settings.get<string>('snippets')
      )) {
        if (taken.has(snippet.name)) {
          ctx.warn(`snippet /${snippet.name} clashes with an existing command`);
          continue;
        }
        registered.push(
          ctx.commands.register({
            id: snippet.name,
            name: `Snippet: ${snippet.name}`,
            description: snippet.text.split('\n')[0].slice(0, 60),
            execute: cmd => cmd.insertText(snippet.text),
          })
        );
      }
    };

    sync();
    ctx.settings.onChange(key => {
      if (key === 'snippets') {
        sync();
      }
    });

    ctx.commands.register({
      id: 'snip',
      name: 'Snippets',
      usage: '[name]',
      description: 'Insert a snippet, or list them',
      execute: cmd => {
        const all = parseSnippets(ctx.settings.get<string>('snippets'));
        const match = all.find(s => s.name === cmd.args[0]?.toLowerCase());
        if (match) {
          cmd.insertText(match.text);
          return;
        }
        cmd.reply(
          all.length
            ? `Snippets: ${all.map(s => `/${s.name}`).join(', ')}`
            : 'No snippets yet — add some in Settings → Modules'
        );
      },
    });
  },
} satisfies AddonManifest;
