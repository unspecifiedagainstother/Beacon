// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Splits staged attachments into messages Signal clients can show.
 *
 * Signal only renders several attachments in one message as a photo/video
 * album; files (PDFs, audio, archives, ...) must be one per message. Beacon
 * lets you stage any mix and sends: the album first (if any), then each
 * file as its own message, in the order they were added.
 */

import type { AttachmentType } from '../../types/Attachment.std.ts';
import {
  isImageAttachment,
  isVideoAttachment,
} from '../../util/Attachment.std.ts';

export function isAlbumAttachment(
  attachment: Pick<AttachmentType, 'contentType'>
): boolean {
  return isImageAttachment(attachment) || isVideoAttachment(attachment);
}

export function splitAttachmentsForSend<
  T extends Pick<AttachmentType, 'contentType'>,
>(attachments: ReadonlyArray<T>): Array<Array<T>> {
  const album = attachments.filter(isAlbumAttachment);
  const files = attachments.filter(a => !isAlbumAttachment(a));
  const groups: Array<Array<T>> = [];
  if (album.length > 0) {
    groups.push(album);
  }
  for (const file of files) {
    groups.push([file]);
  }
  return groups;
}
