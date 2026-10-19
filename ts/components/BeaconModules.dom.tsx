// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';

import type { LocalizerType } from '../types/Util.std.ts';
import type {
  AddonInfo,
  AddonSettingDefinition,
  AddonSettingValue,
} from '../beacon/core/types.dom.ts';
import { AxoSwitch } from '../axo/AxoSwitch.dom.tsx';
import { drop } from '../util/drop.std.ts';

export type PropsType = {
  i18n: LocalizerType;
};

type Filter = 'all' | 'enabled' | 'disabled';

// Reached via the window global so this stays a renderer-only module; the
// loader itself lives in preload land (ts/beacon/core/loader.preload.ts).
function getBeacon() {
  return window.Beacon;
}

function useAddons(): Array<AddonInfo> {
  const [addons, setAddons] = useState<Array<AddonInfo>>(
    () => getBeacon()?.loader.list() ?? []
  );
  useEffect(() => {
    const beacon = getBeacon();
    if (!beacon) {
      return undefined;
    }
    const refresh = () => setAddons(beacon.loader.list());
    refresh();
    return beacon.loader.subscribe(refresh);
  }, []);
  return addons;
}

function useAddonSettings(addonId: string): Record<string, AddonSettingValue> {
  const [values, setValues] = useState(
    () => getBeacon()?.settings.getAll(addonId) ?? {}
  );
  useEffect(() => {
    const beacon = getBeacon();
    if (!beacon) {
      return undefined;
    }
    return beacon.settings.subscribe(changedId => {
      if (changedId === addonId) {
        setValues(beacon.settings.getAll(addonId));
      }
    });
  }, [addonId]);
  return values;
}

function formatCombo(combo: string): string {
  const isMac = /mac/i.test(navigator.platform);
  return combo
    .split('+')
    .map(part => {
      switch (part.toLowerCase()) {
        case 'mod':
          return isMac ? '⌘' : 'Ctrl';
        case 'shift':
          return isMac ? '⇧' : 'Shift';
        case 'alt':
          return isMac ? '⌥' : 'Alt';
        case 'ctrl':
          return 'Ctrl';
        case 'meta':
          return isMac ? '⌘' : 'Meta';
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(isMac ? '' : '+');
}

function SettingControl({
  addonId,
  def,
  value,
}: {
  addonId: string;
  def: AddonSettingDefinition;
  value: AddonSettingValue;
}): JSX.Element {
  const set = (next: AddonSettingValue) =>
    getBeacon()?.settings.set(addonId, def.key, next);
  const inputId = `beacon-setting-${addonId}-${def.key}`;

  // Text fields commit on blur so filters don't re-run on every keystroke.
  // Re-seed the draft when the stored value changes elsewhere (reset, another
  // window) — adjusted during render, not in an effect.
  const [draft, setDraft] = useState(String(value));
  const [seededFrom, setSeededFrom] = useState(value);
  if (seededFrom !== value) {
    setSeededFrom(value);
    setDraft(String(value));
  }

  let control: JSX.Element;
  switch (def.type) {
    case 'toggle':
      control = (
        <AxoSwitch.Root
          checked={Boolean(value)}
          onCheckedChange={checked => set(checked)}
        />
      );
      break;
    case 'select':
      control = (
        <select
          id={inputId}
          aria-label={def.label}
          className="BeaconInput BeaconInput--select"
          value={String(value)}
          onChange={ev => set(ev.target.value)}
        >
          {def.options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
      control = (
        <input
          id={inputId}
          aria-label={def.label}
          className="BeaconInput BeaconInput--number"
          type="number"
          min={def.min}
          max={def.max}
          value={draft}
          onChange={ev => setDraft(ev.target.value)}
          onBlur={() => set(Number(draft))}
        />
      );
      break;
    case 'text':
      control = def.multiline ? (
        <textarea
          id={inputId}
          aria-label={def.label}
          className="BeaconInput BeaconInput--textarea"
          placeholder={def.placeholder}
          value={draft}
          rows={3}
          onChange={ev => setDraft(ev.target.value)}
          onBlur={() => set(draft)}
        />
      ) : (
        <input
          id={inputId}
          aria-label={def.label}
          className="BeaconInput"
          type="text"
          placeholder={def.placeholder}
          value={draft}
          onChange={ev => setDraft(ev.target.value)}
          onBlur={() => set(draft)}
        />
      );
      break;
    default:
      control = <span />;
  }

  const stacked = def.type === 'text' && def.multiline;

  return (
    <div
      className={classNames(
        'BeaconModules__setting',
        stacked && 'BeaconModules__setting--stacked'
      )}
    >
      <label className="BeaconModules__setting-text" htmlFor={inputId}>
        <span className="BeaconModules__setting-label">{def.label}</span>
        {def.description ? (
          <span className="BeaconModules__setting-description">
            {def.description}
          </span>
        ) : null}
      </label>
      <div className="BeaconModules__setting-control">{control}</div>
    </div>
  );
}

function AddonSettingsPanel({
  addon,
  i18n,
}: {
  addon: AddonInfo;
  i18n: LocalizerType;
}): JSX.Element {
  const values = useAddonSettings(addon.id);
  return (
    <div className="BeaconModules__settings">
      {addon.settings.map(def => (
        <SettingControl
          key={def.key}
          addonId={addon.id}
          def={def}
          value={values[def.key] ?? def.defaultValue}
        />
      ))}
      <button
        type="button"
        className="BeaconButton BeaconButton--ghost BeaconModules__reset"
        onClick={() => getBeacon()?.settings.reset(addon.id)}
      >
        {i18n('icu:Beacon__modules-reset')}
      </button>
    </div>
  );
}

function AddonCard({
  addon,
  i18n,
  busy,
  expanded,
  onToggle,
  onExpand,
}: {
  addon: AddonInfo;
  i18n: LocalizerType;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}): JSX.Element {
  const hasSettings = addon.settings.length > 0;
  const hasExtras = addon.commands.length > 0 || addon.keybinds.length > 0;

  return (
    <div
      className={classNames(
        'BeaconModules__card',
        addon.enabled && 'BeaconModules__card--enabled',
        expanded && 'BeaconModules__card--expanded',
        addon.error && 'BeaconModules__card--error'
      )}
    >
      <div className="BeaconModules__card-head">
        <div className="BeaconModules__card-title">
          <span className="BeaconModules__card-name">{addon.name}</span>
          {addon.version ? (
            <span className="BeaconModules__card-version">
              v{addon.version}
            </span>
          ) : null}
        </div>
        <div
          className="BeaconModules__card-switch"
          title={i18n('icu:Beacon__modules-toggle', { name: addon.name })}
        >
          <AxoSwitch.Root
            checked={addon.enabled}
            disabled={busy}
            onCheckedChange={onToggle}
          />
        </div>
      </div>

      {addon.description ? (
        <p className="BeaconModules__card-description">{addon.description}</p>
      ) : null}

      {addon.error ? (
        <div className="BeaconModules__card-error" role="alert">
          {i18n('icu:Beacon__modules-error', { message: addon.error })}
        </div>
      ) : null}

      {hasExtras ? (
        <div className="BeaconModules__card-extras">
          {addon.commands.map(cmd => (
            <code
              key={cmd.id}
              className="BeaconChip BeaconChip--command"
              title={cmd.description}
            >
              /{cmd.id}
            </code>
          ))}
          {addon.keybinds.map(combo => (
            <kbd key={combo} className="BeaconChip BeaconChip--kbd">
              {formatCombo(combo)}
            </kbd>
          ))}
        </div>
      ) : null}

      <div className="BeaconModules__card-foot">
        <div className="BeaconModules__card-tags">
          {addon.tags.map(tag => (
            <span key={tag} className="BeaconChip">
              {tag}
            </span>
          ))}
        </div>
        {hasSettings ? (
          <button
            type="button"
            className={classNames(
              'BeaconButton BeaconButton--ghost BeaconModules__card-settings',
              expanded && 'BeaconModules__card-settings--open'
            )}
            aria-expanded={expanded}
            onClick={onExpand}
          >
            {i18n('icu:Beacon__modules-settings')}
          </button>
        ) : null}
      </div>

      {expanded && hasSettings ? (
        <AddonSettingsPanel addon={addon} i18n={i18n} />
      ) : null}
    </div>
  );
}

export function BeaconModules({ i18n }: PropsType): JSX.Element {
  const addons = useAddons();
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | undefined>(undefined);

  const toggleAddon = useCallback(async (id: string) => {
    setBusy(id);
    try {
      await getBeacon()?.loader.toggle(id);
    } catch {
      // The loader logs start/stop failures and surfaces them on the card.
    }
    setBusy(undefined);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return addons.filter(addon => {
      if (filter === 'enabled' && !addon.enabled) {
        return false;
      }
      if (filter === 'disabled' && addon.enabled) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [addon.name, addon.id, addon.description ?? '', ...addon.tags]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [addons, query, filter]);

  const enabledCount = addons.filter(a => a.enabled).length;

  if (addons.length === 0) {
    return (
      <div className="BeaconModules">
        <div className="BeaconEmpty">{i18n('icu:Beacon__modules-empty')}</div>
      </div>
    );
  }

  return (
    <div className="BeaconModules">
      <p className="BeaconModules__description">
        {i18n('icu:Beacon__modules-description')}
      </p>

      <div className="BeaconModules__toolbar">
        <input
          className="BeaconInput BeaconModules__search"
          type="search"
          value={query}
          placeholder={i18n('icu:Beacon__modules-search')}
          aria-label={i18n('icu:Beacon__modules-search')}
          onChange={ev => setQuery(ev.target.value)}
        />
        <div className="BeaconSegmented" role="tablist">
          {(['all', 'enabled', 'disabled'] as const).map(value => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={classNames(
                'BeaconSegmented__item',
                filter === value && 'BeaconSegmented__item--active'
              )}
              onClick={() => setFilter(value)}
            >
              {value === 'all' && i18n('icu:Beacon__modules-filter-all')}
              {value === 'enabled' &&
                i18n('icu:Beacon__modules-filter-enabled')}
              {value === 'disabled' &&
                i18n('icu:Beacon__modules-filter-disabled')}
            </button>
          ))}
        </div>
      </div>

      <div className="BeaconModules__count">
        {i18n('icu:Beacon__modules-count', {
          enabled: enabledCount,
          total: addons.length,
        })}
      </div>

      {visible.length === 0 ? (
        <div className="BeaconEmpty">
          {i18n('icu:Beacon__modules-no-matches')}
        </div>
      ) : (
        <div className="BeaconModules__grid">
          {visible.map(addon => (
            <AddonCard
              key={addon.id}
              addon={addon}
              i18n={i18n}
              busy={busy === addon.id}
              expanded={expanded === addon.id}
              onToggle={() => drop(toggleAddon(addon.id))}
              onExpand={() =>
                setExpanded(prev => (prev === addon.id ? undefined : addon.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
