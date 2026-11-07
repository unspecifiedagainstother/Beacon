// Copyright 2018 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';

import type { AttachmentForUIType } from '../../types/Attachment.std.ts';
import type { LocalizerType } from '../../types/Util.std.ts';
import { FileThumbnail } from '../FileThumbnail.dom.tsx';

export type Props = {
  attachment: AttachmentForUIType;
  onClose: (attachment: AttachmentForUIType) => void;
  onClick?: () => void;
  i18n: LocalizerType;
};

export function StagedGenericAttachment({
  attachment,
  i18n,
  onClose,
  onClick,
}: Props): JSX.Element {
  const { fileName } = attachment;

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="module-staged-attachment module-staged-generic-attachment"
      onClick={event => {
        if (
          onClick &&
          !(event.target as HTMLElement).closest(
            '.module-staged-generic-attachment__close-button'
          )
        ) {
          onClick();
        }
      }}
    >
      <button
        type="button"
        className="module-staged-generic-attachment__close-button"
        aria-label={i18n('icu:close')}
        onClick={() => {
          if (onClose) {
            onClose(attachment);
          }
        }}
      />

      <FileThumbnail {...attachment} />
      <div className="module-staged-generic-attachment__filename">
        {fileName}
      </div>
    </div>
  );
}
