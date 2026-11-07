// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX, ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { AxoList } from '../axo/items/AxoList.dom.tsx';
import { AxoItem } from '../axo/items/AxoItem.dom.tsx';
import { AxoClickableItem } from '../axo/items/AxoClickableItem.dom.tsx';
import type { AxoSymbol } from '../axo/AxoSymbol.dom.tsx';
import { drop } from '../util/drop.std.ts';

type Row = {
  symbol: AxoSymbol.Name;
  label: string;
  value: string | undefined;
  pii?: boolean;
};

const SEALED_SENDER_LABELS = [
  'Unknown',
  'Enabled',
  'Disabled',
  'Unrestricted (anyone)',
];
const VERIFIED_LABELS = ['Default (not verified)', 'Verified', 'Unverified'];

function when(timestamp: number | undefined | null): string | undefined {
  if (!timestamp) {
    return undefined;
  }
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function duration(seconds: number | undefined): string | undefined {
  if (!seconds) {
    return undefined;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }
  if (seconds < 86_400) {
    return `${Math.round(seconds / 3600)} h`;
  }
  return `${Math.round(seconds / 86_400)} days`;
}

function mutedUntil(expiresAt: number | undefined): string | undefined {
  if (!expiresAt || expiresAt <= Date.now()) {
    return undefined;
  }
  return expiresAt >= Number.MAX_SAFE_INTEGER ? 'Always' : when(expiresAt);
}

function buildRows(conversationId: string): Array<Row> {
  const conversation = window.ConversationController.get(conversationId);
  if (!conversation) {
    return [];
  }
  const a = conversation.attributes;
  const capabilities = Object.entries(a.capabilities ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name)
    .join(', ');

  const rows: Array<Row | undefined> = [
    { symbol: 'person', label: 'Account ID (ACI)', value: a.serviceId },
    { symbol: 'person', label: 'Phone-number ID (PNI)', value: a.pni },
    { symbol: 'phone', label: 'Phone number', value: a.e164, pii: true },
    { symbol: 'at', label: 'Username', value: a.username },
    {
      symbol: 'person-circle',
      label: 'Profile name',
      value:
        [a.profileName, a.profileFamilyName].filter(Boolean).join(' ') ||
        undefined,
    },
    {
      symbol: 'person-square',
      label: 'Name in your contacts',
      value:
        [a.systemGivenName, a.systemFamilyName].filter(Boolean).join(' ') ||
        undefined,
    },
    {
      symbol: 'pencil',
      label: 'Nickname',
      value:
        [a.nicknameGivenName, a.nicknameFamilyName].filter(Boolean).join(' ') ||
        undefined,
    },
    {
      symbol: 'info',
      label: 'About',
      value: [a.aboutEmoji, a.about].filter(Boolean).join(' ') || undefined,
    },
    {
      symbol: 'shield-check',
      label: 'Safety number',
      value: a.verified === undefined ? undefined : VERIFIED_LABELS[a.verified],
    },
    {
      symbol: 'lock',
      label: 'Sealed sender',
      value:
        a.sealedSender === undefined
          ? undefined
          : SEALED_SENDER_LABELS[a.sealedSender],
    },
    {
      symbol: 'check-circle',
      label: 'Profile shared with you',
      value: a.profileSharing ? 'Yes' : 'No',
    },
    {
      symbol: 'person-key',
      label: 'Profile key',
      value: a.profileKey ? 'Known' : 'Not known',
    },
    {
      symbol: 'badge',
      label: 'Badges',
      value: a.badges?.length ? String(a.badges.length) : undefined,
    },
    { symbol: 'cube', label: 'Capabilities', value: capabilities || undefined },
    {
      symbol: 'error-circle',
      label: 'Unregistered since',
      value: when(a.discoveredUnregisteredAt ?? a.firstUnregisteredAt),
    },
    {
      symbol: 'arrow-clockwise',
      label: 'Profile fetched',
      value: when(a.profileLastFetchedAt),
    },
    { symbol: 'clock', label: 'Last active', value: when(a.active_at) },
    {
      symbol: 'message',
      label: 'Messages',
      value:
        a.messageCount === undefined
          ? undefined
          : `${a.messageCount} total, ${a.sentMessageCount ?? 0} sent by you`,
    },
    {
      symbol: 'timer',
      label: 'Disappearing messages',
      value: duration(a.expireTimer),
    },
    {
      symbol: 'bell-slash',
      label: 'Muted until',
      value: mutedUntil(a.muteExpiresAt),
    },
    {
      symbol: 'block',
      label: 'Blocked',
      value: conversation.isBlocked() ? 'Yes' : undefined,
    },
    {
      symbol: 'archive',
      label: 'Archived',
      value: a.isArchived ? 'Yes' : undefined,
    },
    { symbol: 'copy', label: 'Conversation ID', value: a.id },
  ];
  return rows.filter((row): row is Row => row != null && Boolean(row.value));
}

export function BeaconContactDetails({
  conversationId,
}: {
  conversationId: string;
}): JSX.Element | null {
  const rows = useMemo(() => buildRows(conversationId), [conversationId]);
  const [copied, setCopied] = useState<string | undefined>(undefined);
  if (rows.length === 0) {
    return null;
  }
  const valueNode = (row: Row): ReactNode =>
    row.pii ? <span className="Beacon-pii">{row.value}</span> : row.value;

  return (
    <AxoList.Root>
      <AxoList.Header>
        <AxoList.Label>Details</AxoList.Label>
      </AxoList.Header>
      <AxoList.Body>
        <AxoItem.Group>
          {rows.map(row => (
            <AxoClickableItem.Root
              key={row.label}
              symbol={row.symbol}
              label={row.label}
              description={
                <span className="BeaconContactDetails__value">
                  {copied === row.label ? 'Copied' : valueNode(row)}
                </span>
              }
              onClick={() => {
                drop(navigator.clipboard.writeText(row.value ?? ''));
                setCopied(row.label);
              }}
            />
          ))}
        </AxoItem.Group>
      </AxoList.Body>
    </AxoList.Root>
  );
}
