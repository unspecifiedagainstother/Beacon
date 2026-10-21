// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Attachment privacy.
 *
 * Outgoing (filter 'attachment.outgoing', in processAttachment):
 *  - random file names, keeping the extension (default on). Signal already
 *    drops the name of photos and videos; this covers files and documents.
 *  - metadata: remove (default), ask each time, or leave alone — see
 *    ../util/metadata.std.ts for the formats. Photos Signal re-encodes are
 *    clean anyway; this catches GIF/WebP, videos, audio, PDFs and documents.
 *  - a warning before sending file types Beacon can't clean.
 *
 * Incoming (filter 'attachment.autoDownload'): rules applied on top of
 * Signal's own per-type settings, which Beacon defaults to all off.
 */

import type { AddonManifest } from '../core/types.dom.ts';
import { ICON_ATTACHMENT_PRIVACY } from '../addons/icons.std.ts';
import { askChoice, askConfirm } from '../core/prompts.dom.ts';
import { isUncleanableDocument, stripMetadata } from '../util/metadata.std.ts';

function randomName(original: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const stem = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const ext = /\.[a-z0-9]{1,8}$/i.exec(original)?.[0]?.toLowerCase() ?? '';
  return stem + ext;
}

function isKnownSender(serviceId: string | undefined): boolean {
  if (!serviceId) {
    return false;
  }
  const sender = window.ConversationController.get(serviceId);
  if (!sender) {
    return false;
  }
  return Boolean(
    sender.get('profileSharing') ||
    sender.get('systemGivenName') ||
    sender.get('name')
  );
}

export default {
  id: 'attachment-privacy',
  builtin: true,
  category: 'privacy',
  icon: ICON_ATTACHMENT_PRIVACY,
  name: 'Attachments',
  version: '1.0.0',
  description:
    'File names and hidden metadata in what you send, and what gets downloaded automatically.',
  authors: ['Beacon'],
  settings: [
    {
      key: 'randomNames',
      type: 'toggle',
      symbol: 'file',
      label: 'Random file names when sending',
      description:
        'report-final.pdf is sent as e.g. 3fa91c04b2d7.pdf. Photos and videos never carry a name.',
      defaultValue: true,
    },
    {
      key: 'metadata',
      type: 'select',
      symbol: 'info',
      label: 'Hidden file metadata',
      description:
        'Location, camera, author, company, edit dates and software in photos, videos, audio, PDFs and Office/OpenDocument files.',
      options: [
        { value: 'strip', label: 'Remove automatically' },
        { value: 'ask', label: 'Ask each time' },
        { value: 'off', label: 'Leave files unchanged' },
      ],
      defaultValue: 'strip',
    },
    {
      key: 'notifyStripped',
      type: 'toggle',
      symbol: 'bell',
      label: 'Tell me what was removed',
      defaultValue: true,
    },
    {
      key: 'warnUnsupported',
      type: 'toggle',
      symbol: 'error',
      label: 'Warn before sending files that can’t be cleaned',
      description:
        'Old Office formats, RAW/HEIC/TIFF photos, SVG, FLAC/OGG/WAV, MKV/WebM and similar.',
      defaultValue: true,
    },
    {
      key: 'downloadKnownOnly',
      type: 'toggle',
      symbol: 'person-check',
      label: 'Auto-download only from people you know',
      description:
        'Contacts and people you’ve accepted. Applies on top of Data usage → Media auto-download, which Beacon turns off by default.',
      defaultValue: true,
    },
    {
      key: 'downloadInGroups',
      type: 'toggle',
      symbol: 'group',
      label: 'Auto-download in groups',
      defaultValue: false,
    },
    {
      key: 'downloadMaxMb',
      type: 'number',
      symbol: 'arrow-down',
      label: 'Auto-download size limit (MB)',
      description: '0 means no limit.',
      min: 0,
      max: 2048,
      defaultValue: 25,
    },
  ],

  start(ctx) {
    ctx.filters.addAsync('attachment.outgoing', async (attachment, info) => {
      if (!attachment || attachment.pending) {
        return attachment;
      }
      let next = attachment;
      const displayName = info.originalName || 'file';

      // -- Metadata
      const mode = ctx.settings.get<string>('metadata');
      if (mode !== 'off') {
        const cleaned = stripMetadata(next.data, info.originalName);
        if (cleaned.found.length > 0) {
          let remove = mode === 'strip';
          if (mode === 'ask') {
            const choice = await askChoice({
              title: 'This file contains hidden metadata',
              intro: `${displayName}: ${cleaned.found.join(', ')}.`,
              choices: [
                { value: 'strip', label: 'Remove it and send' },
                { value: 'keep', label: 'Send unchanged' },
                { value: 'cancel', label: 'Don’t attach' },
              ],
            });
            if (choice === undefined || choice === 'cancel') {
              return null;
            }
            remove = choice === 'strip';
          }
          if (remove) {
            next = {
              ...next,
              data: cleaned.data,
              size: cleaned.data.byteLength,
            };
            if (ctx.settings.get<boolean>('notifyStripped')) {
              ctx.ui.showNotification(
                `Removed from ${displayName}: ${cleaned.found.join(', ')}`,
                'success'
              );
            }
          }
        }
        if (cleaned.partial && ctx.settings.get<boolean>('warnUnsupported')) {
          const send = await askConfirm({
            title: 'Some metadata could not be removed',
            body: `${displayName}: ${cleaned.notes.join(' ')}`,
            confirmLabel: 'Attach anyway',
          });
          if (!send) {
            return null;
          }
        } else if (
          cleaned.kind === undefined &&
          isUncleanableDocument(info.originalName) &&
          ctx.settings.get<boolean>('warnUnsupported')
        ) {
          const send = await askConfirm({
            title: 'Beacon can’t clean this file type',
            body: `${displayName} may contain hidden details such as author, device, location or edit history, and Beacon can’t remove them from this format.`,
            confirmLabel: 'Attach anyway',
          });
          if (!send) {
            return null;
          }
        }
      }

      // -- Name
      if (ctx.settings.get<boolean>('randomNames') && next.fileName) {
        next = { ...next, fileName: randomName(next.fileName) };
      }
      return next;
    });

    ctx.filters.add('attachment.autoDownload', (allowed, info) => {
      if (!allowed) {
        return allowed;
      }
      const maxMb = ctx.settings.get<number>('downloadMaxMb');
      if (maxMb > 0 && info.size > maxMb * 1024 * 1024) {
        return false;
      }
      const conversation = window.ConversationController.get(
        info.conversationId
      );
      const isGroup = conversation?.get('type') === 'group';
      if (isGroup && !ctx.settings.get<boolean>('downloadInGroups')) {
        return false;
      }
      if (
        ctx.settings.get<boolean>('downloadKnownOnly') &&
        !isKnownSender(info.sourceServiceId)
      ) {
        return false;
      }
      return true;
    });
  },
} satisfies AddonManifest;
