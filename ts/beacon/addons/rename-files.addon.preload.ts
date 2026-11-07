// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import type { AttachmentDraftType } from '../../types/Attachment.std.ts';
import { ICON_RENAME_FILES } from './icons.std.ts';
import { getSelectedConversationId } from '../../state/selectors/nav.std.ts';
import { getComposerStateForConversation } from '../../state/ducks/composer.preload.ts';
import { drop } from '../../util/drop.std.ts';
import {
  isImageAttachment,
  isVideoAttachment,
} from '../../util/Attachment.std.ts';

const KEEP_KEY = 'keepNames';

type Identifiable = { clientUuid?: string; path?: string; fileName?: string };

function sameAttachment(a: Identifiable, b: Identifiable): boolean {
  if (a.clientUuid && b.clientUuid) {
    return a.clientUuid === b.clientUuid;
  }
  return Boolean(a.path) && a.path === b.path;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

function findDraft(
  ctx: AddonContext,
  attachment: Identifiable
):
  | {
      conversationId: string;
      attachments: ReadonlyArray<AttachmentDraftType>;
      draft: AttachmentDraftType;
    }
  | undefined {
  const state = ctx.redux.getState();
  const conversationId = getSelectedConversationId(state);
  if (!conversationId) {
    return undefined;
  }
  const { attachments } = getComposerStateForConversation(
    state.composer,
    conversationId
  );
  const draft = attachments.find(a => sameAttachment(a, attachment));
  return draft ? { conversationId, attachments, draft } : undefined;
}

function askForName(
  ctx: AddonContext,
  current: string,
  original: string,
  visual: boolean
): Promise<string | undefined> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: string | undefined) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const el = ctx.ui.createElement;
    const input = el({
      tag: 'input',
      className: 'BeaconInput',
      attrs: { type: 'text', spellcheck: 'false', autocomplete: 'off' },
    }) as HTMLInputElement;
    input.value = current;
    if (visual) {
      input.placeholder = 'No name (photos and videos are sent without one)';
    }

    const error = el({ tag: 'p', className: 'BeaconPrompt__error' });
    error.hidden = true;

    const children: Array<HTMLElement> = [input, error];
    if (original && original !== current) {
      children.push(
        el({
          tag: 'p',
          className: 'BeaconPrompt__intro',
          text: `Original name: ${original}`,
        })
      );
    }
    const form = el({ tag: 'form', className: 'BeaconPrompt', children });

    const submit = () => {
      const { value } = input;
      if (value.length === 0 && !visual) {
        error.textContent = 'The name can’t be empty.';
        error.hidden = false;
        return;
      }
      finish(value);
      modal.close();
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      submit();
    });

    const actions = [
      {
        label: 'Cancel',
        onClick: () => {
          finish(undefined);
          modal.close();
        },
      },
      ...(original !== current && (original || visual)
        ? [
            {
              label: 'Reset',
              onClick: () => {
                input.value = original;
                input.focus();
              },
            },
          ]
        : []),
      { label: 'Rename', variant: 'primary' as const, onClick: submit },
    ];

    const modal = ctx.ui.createModal({
      title: 'Rename file',
      content: form,
      onClose: () => finish(undefined),
      actions,
    });

    input.focus();
    const ext = extensionOf(current);
    input.setSelectionRange(0, current.length - ext.length);
  });
}

export default {
  id: 'rename-files',
  icon: ICON_RENAME_FILES,
  name: 'Rename Files',
  version: '1.0.0',
  description:
    'Rename files before you send them: click a file you attached (or right-click any attachment, photos too) and type the name it should have.',
  authors: ['Beacon'],
  tags: ['utility', 'privacy'],
  defaultEnabled: true,
  settings: [
    {
      key: 'clickToRename',
      type: 'toggle',
      label: 'Click a file to rename it',
      description: 'Right-click always works, for photos and videos too.',
      defaultValue: true,
    },
    {
      key: 'keepExtension',
      type: 'toggle',
      label: 'Keep the original extension',
      description: 'Add it back if the new name drops or changes it.',
      defaultValue: false,
    },
  ],
  start(ctx) {
    const originals = new Map<string, string>();
    const keep = new Set<string>(
      ctx.storage.get<Array<string>>(KEEP_KEY) ?? []
    );
    const saveKeep = () =>
      ctx.storage.set(KEEP_KEY, Array.from(keep).slice(-500));

    ctx.filters.add('attachment.keepFileName', (kept, info) =>
      kept ||
      (Boolean(info.clientUuid) &&
        keep.has(info.clientUuid ?? '') &&
        Boolean(info.fileName))
        ? true
        : undefined
    );

    const rename = async (attachment: Identifiable) => {
      const found = findDraft(ctx, attachment);
      if (!found) {
        return false;
      }
      const { draft } = found;
      if (draft.pending) {
        ctx.ui.showNotification('Wait until the file has finished loading');
        return true;
      }
      const visual = isImageAttachment(draft) || isVideoAttachment(draft);
      const current = draft.fileName ?? '';
      const key = draft.clientUuid ?? draft.path ?? current;
      const original = originals.get(key) ?? current;

      let next = await askForName(ctx, current, original, visual);
      if (next === undefined || next === current) {
        return true;
      }
      const ext = extensionOf(original);
      if (
        next &&
        ctx.settings.get<boolean>('keepExtension') &&
        ext &&
        !next.toLowerCase().endsWith(ext.toLowerCase())
      ) {
        next += ext;
      }
      if (visual && draft.clientUuid) {
        if (next) {
          keep.add(draft.clientUuid);
        } else {
          keep.delete(draft.clientUuid);
        }
        saveKeep();
      }

      const latest = findDraft(ctx, attachment);
      if (!latest) {
        return true;
      }
      originals.set(key, original);
      ctx.signal.reduxActions.composer.replaceAttachments(
        latest.conversationId,
        latest.attachments.map(a =>
          sameAttachment(a, draft) ? { ...a, fileName: next || undefined } : a
        )
      );
      return true;
    };

    ctx.filters.add('composer.attachmentAction', (handled, info) => {
      if (handled) {
        return undefined;
      }
      if (
        info.action === 'click' &&
        !ctx.settings.get<boolean>('clickToRename')
      ) {
        return undefined;
      }
      if (!findDraft(ctx, info.attachment)) {
        return undefined;
      }
      drop(rename(info.attachment));
      return true;
    });

    const syncClass = () => {
      disposeClass?.();
      disposeClass = ctx.settings.get<boolean>('clickToRename')
        ? ctx.css.bodyClass('beacon-rename-files')
        : undefined;
    };
    let disposeClass: (() => void) | undefined;
    syncClass();
    ctx.settings.onChange(syncClass);
  },
} satisfies AddonManifest;
