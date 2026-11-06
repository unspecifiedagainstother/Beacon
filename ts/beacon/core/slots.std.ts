// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

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
