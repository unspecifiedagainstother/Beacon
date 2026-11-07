// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { SlotName, SlotProps } from '../beacon/core/slots.std.ts';
import { getSlotRenderers, subscribeSlots } from '../beacon/core/slots.std.ts';

export type PropsType<Name extends SlotName> = {
  name: Name;
  props: SlotProps[Name];
};

/**
 * Hosts addon renderers for one named slot (see beacon/core/slots.std.ts).
 * Renders nothing visible when no addon uses the slot.
 */
export function BeaconSlot<Name extends SlotName>({
  name,
  props,
}: PropsType<Name>): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderers, setRenderers] = useState(() => getSlotRenderers(name));
  // Props are small plain objects; compare by value so addon DOM is not
  // rebuilt on every parent render.
  const propsKey = JSON.stringify(props);

  useEffect(
    () => subscribeSlots(() => setRenderers(getSlotRenderers(name))),
    [name]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const slotProps = JSON.parse(propsKey) as SlotProps[Name];
    const cleanups: Array<() => void> = [];
    for (const render of renderers) {
      const container = document.createElement('div');
      container.className = 'BeaconSlot__item';
      host.appendChild(container);
      let cleanup: void | (() => void);
      try {
        cleanup = render(container, slotProps);
      } catch {
        // A broken addon renderer must not take the header down.
      }
      cleanups.push(() => {
        try {
          cleanup?.();
        } catch {
          // see above
        }
        container.remove();
      });
    }
    return () => cleanups.forEach(fn => fn());
  }, [renderers, propsKey]);

  return (
    <div
      ref={hostRef}
      className={`BeaconSlot BeaconSlot--${name.replace(/\./g, '-')}`}
    />
  );
}
