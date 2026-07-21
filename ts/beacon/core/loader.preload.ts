// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The one and only addon loader.
 *
 * Addons are TypeScript modules bundled with the app (no string eval). Each
 * exports an AddonManifest. Enable/disable is live: enabling calls start()
 * with a fresh context, disabling runs stop() and then disposes everything
 * the addon registered. No app reload.
 */

import type { Store } from 'redux';
import type { StateType } from '../../state/reducer.preload.ts';
import type { AddonManifest } from './types.dom.ts';
import type { HookBus } from './hook-bus.std.ts';
import type { DisposableContext } from './context.preload.ts';
import { createAddonContext } from './context.preload.ts';
import { createLogger } from '../../logging/log.std.ts';

const log = createLogger('beacon/loader');

const CONFIG_KEY = 'beacon-addon-config';

type AddonConfig = Record<string, { enabled: boolean }>;

export type AddonInfo = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  enabled: boolean;
};

export class AddonLoader {
  readonly #manifests = new Map<string, AddonManifest>();
  readonly #running = new Map<string, DisposableContext>();
  #store: Store<StateType> | undefined;
  #bus: HookBus | undefined;

  async initialize(store: Store<StateType>, bus: HookBus): Promise<void> {
    this.#store = store;
    this.#bus = bus;

    const manifests = await loadBuiltinManifests();
    const config = this.#loadConfig();

    for (const manifest of manifests) {
      this.#manifests.set(manifest.id, manifest);
      const enabled =
        config[manifest.id]?.enabled ?? manifest.defaultEnabled ?? false;
      if (enabled) {
        // eslint-disable-next-line no-await-in-loop
        await this.#start(manifest);
      }
    }

    log.info(
      `${this.#manifests.size} addons registered, ${this.#running.size} running`
    );
  }

  /** Register an out-of-tree manifest (console experiments, tests). */
  register(manifest: AddonManifest): void {
    this.#manifests.set(manifest.id, manifest);
  }

  list(): Array<AddonInfo> {
    return Array.from(this.#manifests.values()).map(manifest => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      enabled: this.#running.has(manifest.id),
    }));
  }

  isEnabled(id: string): boolean {
    return this.#running.has(id);
  }

  async enable(id: string): Promise<boolean> {
    const manifest = this.#manifests.get(id);
    if (!manifest || this.#running.has(id)) {
      return false;
    }
    const ok = await this.#start(manifest);
    if (ok) {
      this.#saveEnabled(id, true);
    }
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
      log.error(`addon ${id} stop() failed:`, error);
    }
    running.dispose();
    this.#running.delete(id);
    this.#saveEnabled(id, false);
    log.info(`addon ${id} stopped`);
    return true;
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
      log.info(`addon ${manifest.id} started`);
      return true;
    } catch (error) {
      log.error(`addon ${manifest.id} start() failed:`, error);
      disposable.dispose();
      return false;
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

async function loadBuiltinManifests(): Promise<Array<AddonManifest>> {
  const importers = [
    () => import('../addons/ghost-mode.addon.std.ts'),
    () => import('../addons/message-logger.addon.dom.ts'),
    () => import('../addons/quick-mute.addon.std.ts'),
    () => import('../addons/focus-mode.addon.std.ts'),
    () => import('../addons/stats-dashboard.addon.std.ts'),
  ];

  const manifests: Array<AddonManifest> = [];
  for (const importer of importers) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await importer();
      if (mod.default?.id) {
        manifests.push(mod.default);
      }
    } catch (error) {
      log.error('failed to import builtin addon:', error);
    }
  }
  return manifests;
}

export const addonLoader = new AddonLoader();
