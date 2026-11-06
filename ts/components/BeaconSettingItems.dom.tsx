// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { toAxoSymbol } from '../beacon/util/axoSymbol.std.ts';
import { useId, useState } from 'react';

import type { AxoSymbol } from '../axo/AxoSymbol.dom.tsx';
import { AxoItem } from '../axo/items/AxoItem.dom.tsx';
import { AxoSwitchItem } from '../axo/items/AxoSwitchItem.dom.tsx';
import { AxoSelectItem } from '../axo/items/AxoSelectItem.dom.tsx';
import type {
  AddonSettingDefinition,
  AddonSettingValue,
} from '../beacon/core/types.dom.ts';
import { setAddonSetting, useAddonSettings } from './beaconHooks.dom.ts';

export function BeaconSettingItems({
  addonId,
  settings,
}: {
  addonId: string;
  settings: ReadonlyArray<AddonSettingDefinition>;
}): JSX.Element {
  const values = useAddonSettings(addonId);
  return (
    <AxoItem.Group>
      {settings.map(def => (
        <SettingItem
          key={def.key}
          addonId={addonId}
          def={def}
          value={values[def.key] ?? def.defaultValue}
        />
      ))}
    </AxoItem.Group>
  );
}

function SettingItem({
  addonId,
  def,
  value,
}: {
  addonId: string;
  def: AddonSettingDefinition;
  value: AddonSettingValue;
}): JSX.Element {
  const symbol = toAxoSymbol(def.symbol);
  const set = (next: AddonSettingValue) =>
    setAddonSetting(addonId, def.key, next);

  if (def.type === 'toggle') {
    return (
      <AxoSwitchItem.Root
        symbol={symbol}
        label={def.label}
        description={def.description}
        checked={Boolean(value)}
        onCheckedChange={set}
      />
    );
  }
  if (def.type === 'select') {
    return (
      <AxoSelectItem.Root
        symbol={symbol}
        label={def.label}
        description={def.description}
        placeholder=""
        value={String(value)}
        onValueChange={set}
        options={def.options}
      />
    );
  }
  return <FieldItem def={def} value={value} symbol={symbol} onCommit={set} />;
}

function FieldItem({
  def,
  value,
  symbol,
  onCommit,
}: {
  def: Extract<AddonSettingDefinition, { type: 'text' | 'number' }>;
  value: AddonSettingValue;
  symbol: AxoSymbol.Name | undefined;
  onCommit: (value: AddonSettingValue) => void;
}): JSX.Element {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [seededFrom, setSeededFrom] = useState(value);
  if (seededFrom !== value) {
    setSeededFrom(value);
    setDraft(String(value));
  }
  const commit = () => onCommit(def.type === 'number' ? Number(draft) : draft);
  const multiline = def.type === 'text' && def.multiline;

  return (
    <AxoItem.Root>
      {symbol && (
        <AxoItem.Leading>
          <AxoItem.Icon symbol={symbol} />
        </AxoItem.Leading>
      )}
      <AxoItem.Content>
        <AxoItem.Label id={id}>{def.label}</AxoItem.Label>
        {def.description && (
          <AxoItem.Description>{def.description}</AxoItem.Description>
        )}
        {multiline && (
          <textarea
            aria-labelledby={id}
            className="BeaconInput BeaconInput--textarea BeaconSettingItems__textarea"
            value={draft}
            rows={3}
            onChange={ev => setDraft(ev.target.value)}
            onBlur={commit}
          />
        )}
        {def.type === 'text' && !multiline && (
          <input
            aria-labelledby={id}
            className="BeaconInput BeaconSettingItems__text"
            type="text"
            placeholder={def.placeholder}
            spellCheck={false}
            value={draft}
            onChange={ev => setDraft(ev.target.value)}
            onBlur={commit}
          />
        )}
        {def.type === 'number' && (
          <AxoItem.Accessory>
            <input
              aria-labelledby={id}
              className="BeaconInput BeaconSettingItems__number"
              type="number"
              min={def.min}
              max={def.max}
              value={draft}
              onChange={ev => setDraft(ev.target.value)}
              onBlur={commit}
            />
          </AxoItem.Accessory>
        )}
      </AxoItem.Content>
    </AxoItem.Root>
  );
}
