// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Slash-command registry.
 *
 * Commands run with a CommandContext: parsed args, the active conversation,
 * insertText() into the composer (wired by CommandCompletion in Quill), and
 * reply() for output that should not touch the composer.
 */

import { createLogger } from '../../logging/log.std.ts';
import type {
  CommandContext,
  CommandDefinition,
  Disposer,
} from './types.dom.ts';
import { showNotification } from './ui.dom.ts';

const log = createLogger('beacon/commands');

/** What the composer integration provides at execution time. */
export type CommandUIAdapter = {
  insertText: (text: string) => void;
  conversationId: string | undefined;
};

export class CommandRegistry {
  readonly #commands = new Map<string, CommandDefinition>();

  register(command: CommandDefinition): Disposer {
    const id = command.id.toLowerCase();
    if (this.#commands.has(id)) {
      log.warn(`command /${id} re-registered, replacing`);
    }
    const entry = { ...command, id };
    this.#commands.set(id, entry);
    return () => {
      if (this.#commands.get(id) === entry) {
        this.#commands.delete(id);
      }
    };
  }

  unregister(commandId: string): void {
    this.#commands.delete(commandId.toLowerCase());
  }

  get(commandId: string): CommandDefinition | undefined {
    return this.#commands.get(commandId.toLowerCase());
  }

  list(): Array<CommandDefinition> {
    return Array.from(this.#commands.values()).sort((a, b) =>
      a.id.localeCompare(b.id)
    );
  }

  listForAddon(addonId: string): Array<CommandDefinition> {
    return this.list().filter(cmd => cmd.addonId === addonId);
  }

  /**
   * Ranked: exact id, then id prefix, then substring of id/name/description.
   * Exact-first matters — Enter runs the top result, so `/stat` must never
   * resolve to `/logstats` while `/stats` exists.
   */
  search(query: string): Array<CommandDefinition> {
    const q = query.toLowerCase();
    const scored: Array<[number, CommandDefinition]> = [];
    for (const cmd of this.#commands.values()) {
      let score: number;
      if (cmd.id === q) {
        score = 0;
      } else if (cmd.id.startsWith(q)) {
        score = 1;
      } else if (cmd.id.includes(q) || cmd.name.toLowerCase().includes(q)) {
        score = 2;
      } else if (cmd.description?.toLowerCase().includes(q)) {
        score = 3;
      } else {
        continue;
      }
      scored.push([score, cmd]);
    }
    return scored
      .sort((a, b) => a[0] - b[0] || a[1].id.localeCompare(b[1].id))
      .map(([, cmd]) => cmd);
  }

  async execute(
    commandId: string,
    argsRaw = '',
    ui?: Partial<CommandUIAdapter>
  ): Promise<void> {
    const command = this.get(commandId);
    if (!command) {
      showNotification(`Unknown command: /${commandId}`, 'error');
      return;
    }

    const trimmed = argsRaw.trim();
    const ctx: CommandContext = {
      args: trimmed === '' ? [] : trimmed.split(/\s+/),
      argsRaw: trimmed,
      conversationId: ui?.conversationId,
      insertText:
        ui?.insertText ??
        (text => {
          // No composer available (console execution) — fall back to reply.
          showNotification(text, 'info');
        }),
      reply: (text, type = 'info') => showNotification(text, type),
    };

    try {
      await command.execute(ctx);
    } catch (error) {
      log.error(`command /${command.id} failed:`, error);
      showNotification(`/${command.id} failed — see console`, 'error');
    }
  }
}

export const commandRegistry = new CommandRegistry();
