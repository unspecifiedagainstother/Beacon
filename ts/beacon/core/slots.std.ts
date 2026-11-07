// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * UI slots — named places in upstream UI where addons can render.
 *
 * Upstream components drop a <BeaconSlot name="…" props={…}/> at a fixed spot
 * (one line each). Addons register a renderer for that name; each renderer
 * gets its own container element and the slot's props, draws plain DOM into
 * it, and returns a cleanup. When props change or an addon is toggled, the
 * slot re-runs its renderers.
 */

import type {
  Disposer,
  SlotName,
  SlotProps,
  SlotRenderer,
} from './types.dom.ts';

type Entry = { name: SlotName; render: SlotRenderer };

const entries = new Set<Entry>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

export function registerSlot<Name extends SlotName>(
  name: Name,
  render: SlotRenderer<Name>
): Disposer {
  const entry: Entry = { name, render: render as SlotRenderer };
  entries.add(entry);
  notify();
  return () => {
    entries.delete(entry);
    notify();
  };
}

export function getSlotRenderers<Name extends SlotName>(
  name: Name
): Array<SlotRenderer<Name>> {
  return Array.from(entries)
    .filter(entry => entry.name === name)
    .map(entry => entry.render as SlotRenderer<Name>);
}

export function subscribeSlots(listener: () => void): Disposer {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type { SlotName, SlotProps };
