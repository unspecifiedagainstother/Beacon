// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { RawBodyRange } from '../../types/BodyRange.std.ts';

export type BeaconDeletedSnapshot = Readonly<{
  body?: string;
  bodyRanges?: ReadonlyArray<RawBodyRange>;
  attachments?: ReadonlyArray<
    Readonly<{
      contentType?: string;
      fileName?: string;
      size?: number;
      caption?: string;
    }>
  >;
  stickerEmoji?: string;
  previousRevisions?: ReadonlyArray<
    Readonly<{ body?: string; timestamp: number }>
  >;
  deletedAt: number;
  byAdmin: boolean;
}>;

type SnapshotSource = Readonly<{
  body?: string;
  bodyRanges?: ReadonlyArray<RawBodyRange>;
  attachments?: ReadonlyArray<
    Readonly<{
      contentType?: string;
      fileName?: string;
      size?: number;
      caption?: string;
    }>
  >;
  sticker?: Readonly<{ emoji?: string }>;
  editHistory?: ReadonlyArray<Readonly<{ body?: string; timestamp: number }>>;
}>;

export function createDeletedSnapshot(
  message: SnapshotSource,
  options: { byAdmin: boolean; now?: number }
): BeaconDeletedSnapshot | undefined {
  const attachments = message.attachments?.map(a => ({
    contentType: a.contentType,
    fileName: a.fileName,
    size: a.size,
    caption: a.caption,
  }));

  const previousRevisions =
    message.editHistory && message.editHistory.length > 1
      ? message.editHistory
          .slice(1)
          .map(edit => ({ body: edit.body, timestamp: edit.timestamp }))
          .reverse()
      : undefined;

  const hasContent =
    Boolean(message.body) ||
    Boolean(attachments?.length) ||
    Boolean(message.sticker);
  if (!hasContent) {
    return undefined;
  }

  return {
    body: message.body,
    bodyRanges: message.bodyRanges,
    attachments: attachments?.length ? attachments : undefined,
    stickerEmoji: message.sticker?.emoji,
    previousRevisions,
    deletedAt: options.now ?? Date.now(),
    byAdmin: options.byAdmin,
  };
}

export function describeSnapshot(snapshot: BeaconDeletedSnapshot): string {
  const parts: Array<string> = [];
  if (snapshot.body) {
    parts.push(snapshot.body);
  }
  if (snapshot.stickerEmoji) {
    parts.push(`[sticker ${snapshot.stickerEmoji}]`);
  }
  for (const attachment of snapshot.attachments ?? []) {
    parts.push(
      `[${attachment.fileName ?? attachment.contentType ?? 'attachment'}]`
    );
  }
  return parts.join(' ');
}
