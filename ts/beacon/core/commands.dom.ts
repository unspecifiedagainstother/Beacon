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
    if (this.#commands.has(command.id)) {
      log.warn(`command /${command.id} re-registered, replacing`);
    }
    this.#commands.set(command.id, command);
    return () => {
      if (this.#commands.get(command.id) === command) {
        this.#commands.delete(command.id);
      }
    };
  }

  unregister(commandId: string): void {
    this.#commands.delete(commandId);
  }

  list(): Array<CommandDefinition> {
    return Array.from(this.#commands.values());
  }

  search(query: string): Array<CommandDefinition> {
    const q = query.toLowerCase();
    return this.list().filter(
      cmd =>
        cmd.id.toLowerCase().includes(q) ||
        cmd.name.toLowerCase().includes(q) ||
        (cmd.description?.toLowerCase().includes(q) ?? false)
    );
  }

  async execute(
    commandId: string,
    argsRaw = '',
    ui?: Partial<CommandUIAdapter>
  ): Promise<void> {
    const command = this.#commands.get(commandId);
    if (!command) {
      showNotification(`Unknown command: /${commandId}`, 'error');
      return;
    }

    const ctx: CommandContext = {
      args: argsRaw.trim() === '' ? [] : argsRaw.trim().split(/\s+/),
      argsRaw,
      conversationId: ui?.conversationId,
      insertText:
        ui?.insertText ??
        (text => {
          // No composer available (console execution) — fall back to reply.
          showNotification(text, 'info');
        }),
      reply: text => showNotification(text, 'info'),
    };

    try {
      await command.execute(ctx);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[Beacon] command /${commandId} failed:`, error);
      showNotification(`/${commandId} failed — see console`, 'error');
    }
  }
}

export const commandRegistry = new CommandRegistry();
