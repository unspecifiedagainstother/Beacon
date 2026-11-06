// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  AddonSettingDefinition,
  AddonSettingValue,
  Disposer,
} from './types.dom.ts';
import { noop } from 'lodash';

const STORAGE_KEY = 'beacon-addon-settings';

type Listener = (
  addonId: string,
  key: string,
  value: AddonSettingValue
) => void;

type Stored = Record<string, Record<string, AddonSettingValue>>;

function readAll(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function coerce(
  def: AddonSettingDefinition,
  value: unknown
): AddonSettingValue {
  switch (def.type) {
    case 'toggle':
      return typeof value === 'boolean' ? value : def.defaultValue;
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) {
        return def.defaultValue;
      }
      const lo = def.min ?? -Infinity;
      const hi = def.max ?? Infinity;
      return Math.min(hi, Math.max(lo, n));
    }
    case 'select':
      return def.options.some(o => o.value === value)
        ? (value as string)
        : def.defaultValue;
    case 'text':
      return typeof value === 'string' ? value : def.defaultValue;
    default:
      return value as AddonSettingValue;
  }
}

export class AddonSettingsStore {
  readonly #definitions = new Map<string, Array<AddonSettingDefinition>>();
  readonly #listeners = new Set<Listener>();
  #cache: Stored = readAll();

  define(addonId: string, defs: Array<AddonSettingDefinition> = []): void {
    this.#definitions.set(addonId, defs);
  }

  definitions(addonId: string): Array<AddonSettingDefinition> {
    return this.#definitions.get(addonId) ?? [];
  }

  get<T extends AddonSettingValue = AddonSettingValue>(
    addonId: string,
    key: string
  ): T {
    const def = this.definitions(addonId).find(d => d.key === key);
    const stored = this.#cache[addonId]?.[key];
    if (!def) {
      return stored as T;
    }
    return coerce(def, stored) as T;
  }

  getAll(addonId: string): Record<string, AddonSettingValue> {
    const result: Record<string, AddonSettingValue> = {};
    for (const def of this.definitions(addonId)) {
      result[def.key] = this.get(addonId, def.key);
    }
    return result;
  }

  set(addonId: string, key: string, value: AddonSettingValue): void {
    const def = this.definitions(addonId).find(d => d.key === key);
    const next = def ? coerce(def, value) : value;
    this.#cache = {
      ...this.#cache,
      [addonId]: { ...this.#cache[addonId], [key]: next },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#cache));
    } catch {
      noop();
    }
    for (const listener of Array.from(this.#listeners)) {
      try {
        listener(addonId, key, next);
      } catch {
        noop();
      }
    }
  }

  reset(addonId: string): void {
    const rest = { ...this.#cache };
    delete rest[addonId];
    this.#cache = rest;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#cache));
    } catch {
      noop();
    }
    for (const def of this.definitions(addonId)) {
      for (const listener of Array.from(this.#listeners)) {
        try {
          listener(addonId, def.key, def.defaultValue);
        } catch {
          noop();
        }
      }
    }
  }

  subscribe(listener: Listener): Disposer {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

export const addonSettings = new AddonSettingsStore();
