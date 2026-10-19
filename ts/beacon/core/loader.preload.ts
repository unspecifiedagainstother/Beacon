// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The one and only addon loader.
 *
 * Addons are TypeScript modules bundled with the app (no string eval). Each
 * exports an AddonManifest. Enable/disable is live: enabling calls start()
 * with a fresh context, disabling runs stop() and then disposes everything
 * the addon registered. No app reload.
 *
 * The loader is observable (subscribe) so the Settings page re-renders when
 * an addon is toggled from anywhere — the page, /enable, or the console.
 */

import type { Store } from 'redux';
import type { StateType } from '../../state/reducer.preload.ts';
import type { AddonInfo, AddonManifest, Disposer } from './types.dom.ts';
import type { HookBus } from './hook-bus.std.ts';
import type { DisposableContext } from './context.preload.ts';
import { createAddonContext } from './context.preload.ts';
import { commandRegistry } from './commands.dom.ts';
import { addonSettings } from './settings.std.ts';
import { createLogger } from '../../logging/log.std.ts';
import * as Errors from '../../types/errors.std.ts';
import messageLogger from '../addons/message-logger.addon.preload.ts';
import ghostMode from '../addons/ghost-mode.addon.preload.ts';
import clearUrls from '../addons/clear-urls.addon.preload.ts';
import notificationFilter from '../addons/notification-filter.addon.std.ts';
import quickMute from '../addons/quick-mute.addon.std.ts';
import focusMode from '../addons/focus-mode.addon.std.ts';
import statsDashboard from '../addons/stats-dashboard.addon.std.ts';
import readAll from '../addons/read-all.addon.preload.ts';
import textReplace from '../addons/text-replace.addon.preload.ts';
import blurMedia from '../addons/blur-media.addon.std.ts';
import privacyScreen from '../addons/privacy-screen.addon.dom.ts';
import compactMode from '../addons/compact-mode.addon.std.ts';
import snippets from '../addons/snippets.addon.std.ts';
import textFaces from '../addons/text-faces.addon.std.ts';

const log = createLogger('beacon/loader');

const CONFIG_KEY = 'beacon-addon-config';

type AddonConfig = Record<string, { enabled: boolean }>;

export type { AddonInfo };

export class AddonLoader {
  readonly #manifests = new Map<string, AddonManifest>();
  readonly #running = new Map<string, DisposableContext>();
  readonly #errors = new Map<string, string>();
  readonly #listeners = new Set<() => void>();
  #store: Store<StateType> | undefined;
  #bus: HookBus | undefined;
  #initialized = false;

  async initialize(store: Store<StateType>, bus: HookBus): Promise<void> {
    this.#store = store;
    this.#bus = bus;

    const manifests = builtinManifests();
    const config = this.#loadConfig();

    for (const manifest of manifests) {
      this.#define(manifest);
    }

    for (const manifest of manifests) {
      const enabled =
        config[manifest.id]?.enabled ?? manifest.defaultEnabled ?? false;
      if (enabled) {
        // Sequential on purpose: start order is registration order, so
        // addons that stack patches on the same method do so predictably.
        // oxlint-disable-next-line no-await-in-loop
        await this.#start(manifest);
      }
    }

    this.#initialized = true;
    log.info(
      `${this.#manifests.size} addons registered, ${this.#running.size} running`
    );
    this.#notify();
  }

  get initialized(): boolean {
    return this.#initialized;
  }

  /** Register an out-of-tree manifest (console experiments, tests). */
  register(manifest: AddonManifest): void {
    this.#define(manifest);
    this.#notify();
  }

  subscribe(listener: () => void): Disposer {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  list(): Array<AddonInfo> {
    return Array.from(this.#manifests.values())
      .map(manifest => this.#info(manifest))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): AddonInfo | undefined {
    const manifest = this.#manifests.get(id);
    return manifest ? this.#info(manifest) : undefined;
  }

  isEnabled(id: string): boolean {
    return this.#running.has(id);
  }

  async enable(id: string): Promise<boolean> {
    const manifest = this.#manifests.get(id);
    if (!manifest) {
      return false;
    }
    if (this.#running.has(id)) {
      return true;
    }
    const ok = await this.#start(manifest);
    if (ok) {
      this.#saveEnabled(id, true);
    }
    this.#notify();
    return ok;
  }

  async disable(id: string): Promise<boolean> {
    const running = this.#running.get(id);
    const manifest = this.#manifests.get(id);
    if (!running || !manifest) {
      return false;
    }

    try {
      await manifest.stop?.(running.ctx);
    } catch (error) {
      log.error(`addon ${id} stop() failed:`, Errors.toLogFormat(error));
    }
    running.dispose();
    this.#running.delete(id);
    this.#saveEnabled(id, false);
    log.info(`addon ${id} stopped`);
    this.#notify();
    return true;
  }

  async toggle(id: string): Promise<boolean> {
    return this.isEnabled(id) ? this.disable(id) : this.enable(id);
  }

  /** Stop and start again — used after settings that only apply on start. */
  async restart(id: string): Promise<boolean> {
    if (!this.isEnabled(id)) {
      return false;
    }
    await this.disable(id);
    return this.enable(id);
  }

  #define(manifest: AddonManifest): void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
      log.warn(`addon id "${manifest.id}" is not kebab-case`);
    }
    this.#manifests.set(manifest.id, manifest);
    addonSettings.define(manifest.id, manifest.settings);
  }

  #info(manifest: AddonManifest): AddonInfo {
    const running = this.#running.get(manifest.id);
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      authors: manifest.authors ?? [],
      tags: manifest.tags ?? [],
      icon: manifest.icon,
      enabled: running != null,
      error: this.#errors.get(manifest.id),
      settings: manifest.settings ?? [],
      commands: running
        ? commandRegistry.listForAddon(manifest.id).map(cmd => ({
            id: cmd.id,
            usage: cmd.usage,
            description: cmd.description,
          }))
        : [],
      keybinds: running ? running.keybinds() : [],
    };
  }

  async #start(manifest: AddonManifest): Promise<boolean> {
    if (!this.#store || !this.#bus) {
      log.error('loader used before initialize()');
      return false;
    }
    const disposable = createAddonContext(manifest, this.#store, this.#bus);
    try {
      await manifest.start(disposable.ctx);
      this.#running.set(manifest.id, disposable);
      this.#errors.delete(manifest.id);
      log.info(`addon ${manifest.id} started`);
      return true;
    } catch (error) {
      log.error(
        `addon ${manifest.id} start() failed:`,
        Errors.toLogFormat(error)
      );
      this.#errors.set(
        manifest.id,
        error instanceof Error ? error.message : String(error)
      );
      disposable.dispose();
      return false;
    }
  }

  #notify(): void {
    for (const listener of Array.from(this.#listeners)) {
      try {
        listener();
      } catch (error) {
        log.error('loader listener threw:', error);
      }
    }
  }

  #loadConfig(): AddonConfig {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? (JSON.parse(raw) as AddonConfig) : {};
    } catch {
      return {};
    }
  }

  #saveEnabled(id: string, enabled: boolean): void {
    try {
      const config = this.#loadConfig();
      config[id] = { enabled };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      log.error('failed to save addon config:', error);
    }
  }
}

/**
 * Builtin addons are imported statically. Dynamic import() looks tidier but
 * makes rolldown split each addon into a chunk that require()s the preload
 * entry bundle back — a circular require that fails at runtime for every
 * addon importing app internals.
 */
const BUILTIN_MANIFESTS: ReadonlyArray<AddonManifest> = [
  messageLogger,
  ghostMode,
  clearUrls,
  notificationFilter,
  quickMute,
  focusMode,
  statsDashboard,
  readAll,
  textReplace,
  blurMedia,
  privacyScreen,
  compactMode,
  snippets,
  textFaces,
];

function builtinManifests(): Array<AddonManifest> {
  return BUILTIN_MANIFESTS.filter(manifest => {
    if (!manifest?.id) {
      log.error('builtin addon without an id, skipping');
      return false;
    }
    return true;
  });
}

export const addonLoader = new AddonLoader();
