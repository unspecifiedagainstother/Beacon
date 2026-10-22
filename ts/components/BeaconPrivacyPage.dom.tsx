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
import type { DuressAction } from '../beacon/core/lock.dom.ts';
import {
  isLockConfigured,
  lock,
  onLockChange,
  removePassphrase,
  setDuress,
  setPassphrase,
} from '../beacon/core/lock.dom.ts';
import {
  askChoice,
  askConfirm,
  askPassword,
} from '../beacon/core/prompts.dom.ts';
import { showNotification } from '../beacon/core/ui.dom.ts';
import { BeaconSettingItems } from './BeaconSettingItems.dom.tsx';
import { useAddons, useAddonSettings } from './beaconHooks.dom.ts';
import { drop } from '../util/drop.std.ts';

export type PropsType = {
  i18n: LocalizerType;
};

// Order of sections on the page; anything not listed goes last.
const SECTION_ORDER = [
  'app-lock',
  'hidden-chats',
  'app-privacy',
  'screen-share-guard',
  'chat-list-privacy',
  'attachment-privacy',
  'link-safety',
  'notification-privacy',
  'unverified-guard',
  'sealed-sender',
  'encrypted-exports',
  'proxy',
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
    label: 'App lock passphrase',
    addonId: 'app-lock',
    isOn: () => isLockConfigured(),
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
  // Re-render when the passphrase is set or removed.
  useLockConfigured();
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

async function changePassphrase(configured: boolean): Promise<void> {
  let current: string | undefined;
  if (configured) {
    current = await askPassword({
      title: 'Current passphrase',
      submitLabel: 'Next',
    });
    if (current == null) {
      return;
    }
  }
  const next = await askPassword({
    title: configured ? 'New passphrase' : 'Set a passphrase',
    intro:
      'Beacon will ask for it on start and after inactivity. If you forget it you’ll have to reinstall Beacon and link it again.',
    confirm: true,
    minLength: 6,
    submitLabel: 'Save',
  });
  if (next == null) {
    return;
  }
  const ok = await setPassphrase(next, current);
  showNotification(
    ok ? 'Passphrase saved' : 'Wrong current passphrase',
    ok ? 'success' : 'error'
  );
}

async function turnOffLock(): Promise<void> {
  const current = await askPassword({
    title: 'Turn off app lock',
    intro: 'Also removes the duress passphrase.',
    submitLabel: 'Turn off',
  });
  if (current == null) {
    return;
  }
  const ok = await removePassphrase(current);
  showNotification(
    ok ? 'App lock turned off' : 'Wrong passphrase',
    ok ? 'success' : 'error'
  );
}

async function configureDuress(): Promise<void> {
  const action = await askChoice<DuressAction | 'remove'>({
    title: 'Duress passphrase',
    intro:
      'A second passphrase for when you’re forced to unlock Beacon. It opens the app normally but:',
    choices: [
      {
        value: 'decoy',
        label: 'Keep hidden and locked chats out of sight',
        description:
          'They can’t be shown or opened until Beacon restarts, and send no notifications.',
      },
      {
        value: 'wipe',
        label: 'Erase all Beacon data',
        description:
          'Unlinks this device and deletes all messages on this computer. Cannot be undone.',
      },
      {
        value: 'remove',
        label: 'Remove the duress passphrase',
      },
    ],
  });
  if (!action) {
    return;
  }
  if (action === 'wipe') {
    const sure = await askConfirm({
      title: 'Erase everything on duress?',
      body: 'Entering the duress passphrase will immediately unlink this device and delete every message, attachment and setting Beacon has on this computer. Your phone keeps its messages.',
      confirmLabel: 'Use erase',
      destructive: true,
    });
    if (!sure) {
      return;
    }
  }
  const real = await askPassword({
    title: 'Your real passphrase',
    intro: 'To confirm it’s you.',
    submitLabel: 'Next',
  });
  if (real == null) {
    return;
  }
  let duress: { passphrase: string; action: DuressAction } | undefined;
  if (action !== 'remove') {
    const passphrase = await askPassword({
      title: 'Duress passphrase',
      intro: 'Must differ from your real passphrase.',
      confirm: true,
      minLength: 6,
      submitLabel: 'Save',
    });
    if (passphrase == null) {
      return;
    }
    duress = { passphrase, action };
  }
  const result = await setDuress(real, duress);
  if (result === 'ok') {
    showNotification(
      duress ? 'Duress passphrase saved' : 'Duress passphrase removed',
      'success'
    );
  } else if (result === 'same') {
    showNotification('Use a different passphrase for duress', 'error');
  } else {
    showNotification('Wrong passphrase', 'error');
  }
}

function useLockConfigured(): boolean {
  const [configured, setConfigured] = useState(isLockConfigured);
  useEffect(() => onLockChange(() => setConfigured(isLockConfigured())), []);
  return configured;
}

function LockActions(): JSX.Element {
  const configured = useLockConfigured();
  return (
    <AxoItem.Group>
      <AxoClickableItem.Root
        symbol="key"
        label={configured ? 'Change passphrase' : 'Set a passphrase'}
        description={
          configured
            ? 'App lock is on.'
            : 'App lock, locked chats and the duress passphrase need one.'
        }
        arrow="next"
        onClick={() => drop(changePassphrase(configured))}
      />
      {configured ? (
        <>
          <AxoClickableItem.Root
            symbol="error-triangle"
            label="Duress passphrase"
            description="Set, change or remove. Nothing on disk shows whether one exists."
            arrow="next"
            onClick={() => drop(configureDuress())}
          />
          <AxoClickableItem.Root
            symbol="lock"
            label="Lock now"
            description="Mod+Alt+L"
            arrow="next"
            onClick={lock}
          />
          <AxoClickableItem.Root
            symbol="lock-open"
            label="Turn off app lock"
            variant="destructive"
            onClick={() => drop(turnOffLock())}
          />
        </>
      ) : null}
    </AxoItem.Group>
  );
}

type ProxyStatus = { proxyUrl: string; fromEnvironment: boolean };

function ProxySection(): JSX.Element {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [fromEnvironment, setFromEnvironment] = useState(false);

  useEffect(() => {
    let cancelled = false;
    drop(
      (async () => {
        const status = (await window.IPC.beaconInvoke(
          'proxy:get'
        )) as ProxyStatus;
        if (!cancelled) {
          setValue(status.proxyUrl);
          setSaved(status.proxyUrl);
          setFromEnvironment(status.fromEnvironment);
        }
      })()
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: string) => {
    const result = (await window.IPC.beaconInvoke('proxy:set', next)) as {
      ok: boolean;
      error?: string;
    };
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setValue(next);
    setSaved(next);
    setMessage(
      next
        ? 'Saved. Restart Beacon to connect through the proxy.'
        : 'Proxy removed. Restart Beacon to connect directly.'
    );
  };

  return (
    <div className="BeaconPrivacy__proxy">
      <div className="BeaconPrivacy__proxy-row">
        <input
          className="BeaconInput"
          type="text"
          spellCheck={false}
          placeholder="socks5h://127.0.0.1:9050"
          value={value}
          onChange={ev => setValue(ev.target.value)}
        />
        <button
          type="button"
          className="BeaconButton BeaconButton--primary"
          disabled={value.trim() === (saved ?? '')}
          onClick={() => drop(save(value.trim()))}
        >
          Save
        </button>
      </div>
      <div className="BeaconPrivacy__proxy-row">
        <button
          type="button"
          className="BeaconButton BeaconButton--ghost"
          onClick={() => drop(save('socks5h://127.0.0.1:9050'))}
        >
          Use Tor (127.0.0.1:9050)
        </button>
        {saved ? (
          <button
            type="button"
            className="BeaconButton BeaconButton--ghost"
            onClick={() => drop(save(''))}
          >
            Turn off
          </button>
        ) : null}
      </div>
      {fromEnvironment ? (
        <p className="BeaconPrivacy__proxy-note">
          An HTTPS_PROXY environment variable is set and takes priority.
        </p>
      ) : null}
      {message ? <p className="BeaconPrivacy__proxy-note">{message}</p> : null}
    </div>
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
        {addon.id === 'app-lock' ? <LockActions /> : null}
        {addon.id === 'proxy' ? <ProxySection /> : null}
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
