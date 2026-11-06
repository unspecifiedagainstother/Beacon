// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { SlotName, SlotProps } from '../beacon/core/slots.std.ts';
import { getSlotRenderers, subscribeSlots } from '../beacon/core/slots.std.ts';
import { noop } from 'lodash';

export type PropsType<Name extends SlotName> = {
  name: Name;
  props: SlotProps[Name];
};

export function BeaconSlot<Name extends SlotName>({
  name,
  props,
}: PropsType<Name>): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderers, setRenderers] = useState(() => getSlotRenderers(name));
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
        noop();
      }
      cleanups.push(() => {
        try {
          cleanup?.();
        } catch {
          noop();
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
