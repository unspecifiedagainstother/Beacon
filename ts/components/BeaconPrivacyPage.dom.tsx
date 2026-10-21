// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';

import type { LocalizerType } from '../types/Util.std.ts';
import { AxoList } from '../axo/items/AxoList.dom.tsx';
import { AxoItem } from '../axo/items/AxoItem.dom.tsx';
import { AxoSymbol } from '../axo/AxoSymbol.dom.tsx';
import { AxoClickableItem } from '../axo/items/AxoClickableItem.dom.tsx';
import type { AddonInfo } from '../beacon/core/types.dom.ts';
import type { NetworkEntry } from '../beacon/core/network-log.std.ts';
import { decryptBeaconExportFile } from '../beacon/core/exports.dom.ts';
import { BeaconSettingItems } from './BeaconSettingItems.dom.tsx';
import { useAddons, useAddonSettings } from './beaconHooks.dom.ts';
import { drop } from '../util/drop.std.ts';

export type PropsType = {
  i18n: LocalizerType;
};

// Order of sections on the page; anything not listed goes last.
const SECTION_ORDER = [
  'app-privacy',
  'chat-list-privacy',
  'attachment-privacy',
  'link-safety',
  'notification-privacy',
  'unverified-guard',
  'sealed-sender',
  'encrypted-exports',
  'network-monitor',
];

type Check = {
  label: string;
  addonId: string;
  isOn: (values: Record<string, unknown>) => boolean;
};

const CHECKS: ReadonlyArray<Check> = [
  {
    label: 'Hidden from screen capture',
    addonId: 'app-privacy',
    isOn: v => v.screenProtection === true,
  },
  {
    label: 'No unread count in title, tray or taskbar',
    addonId: 'app-privacy',
    isOn: v => v.neutralTitle === true && v.hideBadge === true,
  },
  {
    label: 'Chat-list previews blurred',
    addonId: 'chat-list-privacy',
    isOn: v => v.blurPreviews === true,
  },
  {
    label: 'File metadata removed',
    addonId: 'attachment-privacy',
    isOn: v => v.metadata !== 'off',
  },
  {
    label: 'Random file names',
    addonId: 'attachment-privacy',
    isOn: v => v.randomNames === true,
  },
  {
    label: 'Links checked before opening',
    addonId: 'link-safety',
    isOn: v => v.confirm !== 'never',
  },
  {
    label: 'Unverified contacts guarded',
    addonId: 'unverified-guard',
    isOn: v => v.mode !== 'off',
  },
  {
    label: 'Exports encrypted',
    addonId: 'encrypted-exports',
    isOn: v => v.enabled === true,
  },
];

function useAllValues(ids: ReadonlyArray<string>) {
  // One hook per id keeps hook order stable: ids is a constant list.
  const values: Record<string, Record<string, unknown>> = {};
  for (const id of ids) {
    // oxlint-disable-next-line react-hooks/rules-of-hooks
    values[id] = useAddonSettings(id);
  }
  return values;
}

const CHECK_IDS = [...new Set(CHECKS.map(c => c.addonId))];

function Dashboard(): JSX.Element {
  const values = useAllValues(CHECK_IDS);
  const results = CHECKS.map(check => ({
    check,
    on: check.isOn(values[check.addonId] ?? {}),
  }));
  const onCount = results.filter(r => r.on).length;

  return (
    <AxoList.Root>
      <AxoList.Header>
        <AxoList.Label>Overview</AxoList.Label>
        <AxoList.Description>
          {onCount} of {results.length} protections on
        </AxoList.Description>
      </AxoList.Header>
      <AxoList.Body>
        <div className="BeaconPrivacy__checks">
          {results.map(({ check, on }) => (
            <div
              key={check.label}
              className={`BeaconPrivacy__check BeaconPrivacy__check--${on ? 'on' : 'off'}`}
            >
              <AxoSymbol.Icon
                symbol={on ? 'check-circle' : 'circle'}
                size={16}
                label={null}
              />
              <span>{check.label}</span>
            </div>
          ))}
        </div>
      </AxoList.Body>
    </AxoList.Root>
  );
}

type WebEvent = { host: string; at: number };

type Row = {
  host: string;
  ports: string;
  sources: string;
  count: number;
  last: number;
};

function mergeRows(
  sockets: ReadonlyArray<NetworkEntry>,
  web: ReadonlyArray<WebEvent>
): Array<Row> {
  const byHost = new Map<
    string,
    { ports: Set<string>; sources: Set<string>; count: number; last: number }
  >();
  const touch = (host: string, source: string, at: number, port?: number) => {
    const row = byHost.get(host) ?? {
      ports: new Set<string>(),
      sources: new Set<string>(),
      count: 0,
      last: 0,
    };
    if (port) {
      row.ports.add(String(port));
    }
    row.sources.add(source);
    row.count += 1;
    row.last = Math.max(row.last, at);
    byHost.set(host, row);
  };
  for (const entry of sockets) {
    for (let i = 0; i < entry.count; i += 1) {
      touch(entry.host, 'app', entry.last, entry.port);
    }
  }
  for (const event of web) {
    const [host, port] = event.host.split(':');
    touch(host ?? event.host, 'web', event.at, port ? Number(port) : undefined);
  }
  return [...byHost.entries()]
    .map(([host, row]) => ({
      host,
      ports: [...row.ports].join(', '),
      sources: [...row.sources].join(' + '),
      count: row.count,
      last: row.last,
    }))
    .sort((a, b) => b.last - a.last);
}

function formatAgo(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  return `${Math.round(minutes / 60)}h ago`;
}

function NetworkTable(): JSX.Element {
  const [rows, setRows] = useState<Array<Row>>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const web = (await window.IPC.beaconInvoke('network:log').catch(
        () => []
      )) as Array<WebEvent>;
      if (!cancelled) {
        setRows(mergeRows(window.Beacon?.network.list() ?? [], web));
        setNow(Date.now());
      }
    };
    const timer = setInterval(() => drop(refresh()), 3000);
    const unsubscribe = window.Beacon?.network.subscribe(() => drop(refresh()));
    drop(refresh());
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe?.();
    };
  }, []);

  const clear = async () => {
    window.Beacon?.network.clear();
    await window.IPC.beaconInvoke('network:clear');
    setRows([]);
  };

  return (
    <AxoList.Root>
      <AxoList.Header>
        <AxoList.Label>Connections this session</AxoList.Label>
        <AxoList.Description>
          The encrypted chat connection to chat.signal.org is opened by
          libsignal and isn’t listed.
        </AxoList.Description>
      </AxoList.Header>
      <AxoList.Body>
        <div className="BeaconPrivacy__network">
          {rows.length === 0 ? (
            <p className="BeaconPrivacy__empty">No connections recorded yet.</p>
          ) : (
            <table className="BeaconPrivacy__table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Port</th>
                  <th>Via</th>
                  <th>Count</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.host}>
                    <td className="BeaconPrivacy__host">{row.host}</td>
                    <td>{row.ports}</td>
                    <td>{row.sources}</td>
                    <td>{row.count}</td>
                    <td>{formatAgo(row.last, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="BeaconPrivacy__network-actions">
            <button
              type="button"
              className="BeaconButton BeaconButton--ghost"
              onClick={() => drop(clear())}
            >
              Clear
            </button>
          </div>
        </div>
      </AxoList.Body>
    </AxoList.Root>
  );
}

function AddonSection({ addon }: { addon: AddonInfo }): JSX.Element {
  return (
    <AxoList.Root>
      <AxoList.Header>
        <AxoList.Label>{addon.name}</AxoList.Label>
        {addon.description ? (
          <AxoList.Description>{addon.description}</AxoList.Description>
        ) : null}
      </AxoList.Header>
      <AxoList.Body>
        <BeaconSettingItems addonId={addon.id} settings={addon.settings} />
        {addon.id === 'encrypted-exports' ? (
          <AxoItem.Group>
            <AxoClickableItem.Root
              symbol="lock-open"
              label="Decrypt an export…"
              description="Open a .beacon-enc.json file and save a readable copy."
              arrow="next"
              onClick={() => drop(decryptBeaconExportFile())}
            />
          </AxoItem.Group>
        ) : null}
      </AxoList.Body>
    </AxoList.Root>
  );
}

export function BeaconPrivacyPage(_props: PropsType): JSX.Element {
  const addons = useAddons();
  const sections = useMemo(
    () =>
      addons
        .filter(addon => addon.builtin && addon.category === 'privacy')
        .sort((a, b) => {
          const ai = SECTION_ORDER.indexOf(a.id);
          const bi = SECTION_ORDER.indexOf(b.id);
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        }),
    [addons]
  );

  return (
    <AxoList.Group>
      <Dashboard />
      {sections.map(addon => (
        <AddonSection key={addon.id} addon={addon} />
      ))}
      <NetworkTable />
    </AxoList.Group>
  );
}
