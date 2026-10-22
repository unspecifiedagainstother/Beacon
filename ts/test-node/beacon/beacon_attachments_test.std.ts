// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { splitAttachmentsForSend } from '../../beacon/util/splitAttachments.std.ts';
import {
  APPLICATION_OCTET_STREAM,
  IMAGE_JPEG,
  IMAGE_PNG,
  VIDEO_MP4,
  stringToMIMEType,
} from '../../types/MIME.std.ts';

describe('beacon splitAttachmentsForSend', () => {
  const pdf = { contentType: stringToMIMEType('application/pdf'), id: 'pdf' };
  const zip = { contentType: APPLICATION_OCTET_STREAM, id: 'zip' };
  const jpg = { contentType: IMAGE_JPEG, id: 'jpg' };
  const png = { contentType: IMAGE_PNG, id: 'png' };
  const mp4 = { contentType: VIDEO_MP4, id: 'mp4' };
  const ids = (groups: Array<Array<{ id: string }>>) =>
    groups.map(group => group.map(a => a.id));

  it('keeps a photo album together', () => {
    assert.deepEqual(ids(splitAttachmentsForSend([jpg, png, mp4])), [
      ['jpg', 'png', 'mp4'],
    ]);
  });

  it('sends each file on its own', () => {
    assert.deepEqual(ids(splitAttachmentsForSend([pdf, zip])), [
      ['pdf'],
      ['zip'],
    ]);
  });

  it('sends the album first, then files in order', () => {
    assert.deepEqual(ids(splitAttachmentsForSend([pdf, jpg, zip, png])), [
      ['jpg', 'png'],
      ['pdf'],
      ['zip'],
    ]);
  });

  it('handles nothing', () => {
    assert.deepEqual(splitAttachmentsForSend([]), []);
  });
});
