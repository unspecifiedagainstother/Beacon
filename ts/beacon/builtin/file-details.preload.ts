// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * File details: right-click a message with attachments → "File details"
 * shows, for every attachment (yours or someone else's), its name, type,
 * size, dimensions or duration, kind (voice note, GIF, …), upload time,
 * download state, hashes and where it lives on disk, plus who sent it and
 * when. Rows copy on click.
 */

import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import type { ReadonlyMessageAttributesType } from '../../model-types.d.ts';
import type { AttachmentType } from '../../types/Attachment.std.ts';
import { defineIcon } from '../core/icons.std.ts';
import { DataReader } from '../../sql/Client.preload.ts';
import { formatFileSize } from '../../util/formatFileSize.std.ts';
import { isVoiceMessage, isGIF } from '../../util/Attachment.std.ts';
import { getAbsoluteAttachmentPath } from '../../util/migrations.preload.ts';
import { drop } from '../../util/drop.std.ts';

export const ICON_FILE_DETAILS = defineIcon([
  'M14 3H6v18h12V7z',
  'M14 3v4h4',
  'M9 12h6',
  'M9 15h6',
  'M9 18h4',
]);

function when(timestamp: number | undefined): string | undefined {
  return timestamp ? new Date(timestamp).toLocaleString() : undefined;
}

function durationText(seconds: number | undefined): string | undefined {
  if (!seconds) {
    return undefined;
  }
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function kindOf(attachment: AttachmentType): string {
  if (isVoiceMessage(attachment)) {
    return 'Voice message';
  }
  if (isGIF(attachment)) {
    return 'GIF';
  }
  const type = String(attachment.contentType ?? '');
  if (type.startsWith('image/')) {
    return 'Image';
  }
  if (type.startsWith('video/')) {
    return 'Video';
  }
  if (type.startsWith('audio/')) {
    return 'Audio file';
  }
  return 'File';
}

function downloadState(attachment: AttachmentType): string {
  if (attachment.path) {
    return 'Downloaded';
  }
  if (attachment.pending) {
    return 'Downloading…';
  }
  if (attachment.error) {
    return 'Failed to download';
  }
  return 'Not downloaded';
}

function senderName(message: ReadonlyMessageAttributesType): string {
  if (message.type === 'outgoing') {
    return 'You';
  }
  const sender = message.sourceServiceId
    ? window.ConversationController.get(message.sourceServiceId)
    : undefined;
  return sender?.getTitle() ?? 'Unknown';
}

type Row = [label: string, value: string | undefined];

function rowsFor(attachment: AttachmentType): Array<Row> {
  const dims =
    attachment.width && attachment.height
      ? `${attachment.width} × ${attachment.height}`
      : undefined;
  return [
    [
      'Name',
      attachment.fileName ??
        '(no name — photos and videos are sent without one)',
    ],
    ['Kind', kindOf(attachment)],
    [
      'Type',
      attachment.contentType ? String(attachment.contentType) : undefined,
    ],
    [
      'Size',
      attachment.size
        ? `${formatFileSize(attachment.size)} (${attachment.size.toLocaleString()} bytes)`
        : undefined,
    ],
    ['Dimensions', dims],
    ['Duration', durationText(attachment.duration)],
    ['Caption', attachment.caption],
    ['Status', downloadState(attachment)],
    ['Uploaded', when(attachment.uploadTimestamp)],
    [
      'CDN',
      attachment.cdnNumber != null ? `cdn${attachment.cdnNumber}` : undefined,
    ],
    ['SHA-256 (file)', attachment.plaintextHash],
    ['Digest', attachment.digest],
    [
      'Saved at',
      attachment.path ? getAbsoluteAttachmentPath(attachment.path) : undefined,
    ],
  ];
}

async function loadMessage(
  messageId: string
): Promise<ReadonlyMessageAttributesType | undefined> {
  const cached = window.MessageCache.getById(messageId);
  if (cached) {
    return cached.attributes;
  }
  const [fetched] = await DataReader.getMessagesById([messageId]);
  return fetched;
}

function attachmentsOf(
  message: ReadonlyMessageAttributesType
): Array<AttachmentType> {
  return [
    ...(message.attachments ?? []),
    ...(message.preview ?? [])
      .map(preview => preview.image)
      .filter((image): image is AttachmentType => image != null),
    ...(message.sticker?.data ? [message.sticker.data] : []),
  ];
}

async function openDetails(ctx: AddonContext, messageId: string) {
  const message = await loadMessage(messageId);
  if (!message) {
    ctx.ui.showNotification('Couldn’t load that message', 'error');
    return;
  }
  const attachments = attachmentsOf(message);
  const el = ctx.ui.createElement;
  const root = el({ tag: 'div', className: 'BeaconFileDetails' });

  const table = (rows: Array<Row>) => {
    const dl = el({ tag: 'dl', className: 'BeaconFileDetails__table' });
    for (const [label, value] of rows) {
      if (!value) {
        continue;
      }
      const dd = el({
        tag: 'dd',
        text: value,
        attrs: { title: 'Click to copy' },
        onClick: async () => {
          await navigator.clipboard.writeText(value);
          ctx.ui.showNotification(`${label} copied`);
        },
      });
      dl.append(el({ tag: 'dt', text: label }), dd);
    }
    return dl;
  };

  root.append(
    table([
      ['From', senderName(message)],
      ['Sent', when(message.sent_at)],
      [
        'Received',
        message.type === 'incoming'
          ? when(message.received_at_ms ?? message.received_at)
          : undefined,
      ],
      ['Server time', when(message.serverTimestamp)],
    ])
  );

  attachments.forEach((attachment, index) => {
    root.append(
      el({
        tag: 'h3',
        className: 'BeaconFileDetails__heading',
        text:
          attachments.length > 1
            ? `File ${index + 1} of ${attachments.length}`
            : 'File',
      }),
      table(rowsFor(attachment))
    );
  });

  ctx.ui.createModal({
    title: 'File details',
    content: root,
  });
}

export default {
  id: 'file-details',
  builtin: true,
  icon: ICON_FILE_DETAILS,
  name: 'File details',
  version: '1.0.0',
  description:
    'Right-click a message with a file → File details: name, type, size, dimensions, duration, upload time, hashes and where it’s saved. Audio files also show their name in the chat.',
  authors: ['Beacon'],

  start(ctx) {
    ctx.filters.add('message.menuItems', (items, { messageId }) => {
      const cached = window.MessageCache.getById(messageId)?.attributes;
      if (cached && attachmentsOf(cached).length === 0) {
        return items;
      }
      return [
        ...items,
        {
          id: 'beacon-file-details',
          label: 'File details',
          symbol: 'info',
          onSelect: () => {
            drop(openDetails(ctx, messageId));
          },
        },
      ];
    });
  },
} satisfies AddonManifest;
