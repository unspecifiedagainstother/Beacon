// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode, JSX } from 'react';
import { diffWords } from '../beacon/util/wordDiff.std.ts';
import { useCallback, useMemo, useState, useRef, Fragment } from 'react';
import lodash from 'lodash';
import type { AttachmentType } from '../types/Attachment.std.ts';
import type { LocalizerType } from '../types/Util.std.ts';
import type { MessagePropsType } from '../state/selectors/message.preload.ts';
import type { PreferredBadgeSelectorType } from '../state/selectors/badges.preload.ts';
import {
  Message,
  MessageInteractivity,
  TextDirection,
} from './conversation/Message.dom.tsx';
import { WidthBreakpoint } from './_util.std.ts';
import { shouldNeverBeCalled } from '../util/shouldNeverBeCalled.std.ts';
import { useTheme } from '../hooks/useTheme.dom.ts';
import { isSameDay } from '../util/timestamp.std.ts';
import { TimelineDateHeader } from './conversation/TimelineDateHeader.dom.tsx';
import { AxoContextMenu } from '../axo/AxoContextMenu.dom.tsx';
import { drop } from '../util/drop.std.ts';
import type { AxoMenuBuilder } from '../axo/AxoMenuBuilder.dom.tsx';
import { strictAssert } from '../util/assert.std.ts';
import { AxoDialog } from '../axo/AxoDialog.dom.tsx';

const { noop } = lodash;

export type PropsType = {
  closeEditHistoryModal: () => unknown;
  editHistoryMessages: Array<MessagePropsType>;
  getPreferredBadge: PreferredBadgeSelectorType;
  i18n: LocalizerType;
  platform: string;
  kickOffAttachmentDownload: (options: { messageId: string }) => void;
  cancelAttachmentDownload: (options: { messageId: string }) => void;
  showLightbox: (options: {
    attachment: AttachmentType;
    messageId: string;
  }) => void;
};

const MESSAGE_DEFAULT_PROPS = {
  canDeleteForEveryone: false,
  canRetryDeleteForEveryone: false,
  retryDeleteForEveryone: shouldNeverBeCalled,
  checkForAccount: shouldNeverBeCalled,
  clearSelectedMessage: shouldNeverBeCalled,
  clearTargetedMessage: shouldNeverBeCalled,
  containerWidthBreakpoint: WidthBreakpoint.Medium,
  doubleCheckMissingQuoteReference: shouldNeverBeCalled,
  interactionMode: 'mouse' as const,
  isBlocked: false,
  isMessageRequestAccepted: true,
  markAttachmentAsCorrupted: shouldNeverBeCalled,
  messageExpanded: shouldNeverBeCalled,
  handleClickCtaButton: shouldNeverBeCalled,
  onReplyToMessage: shouldNeverBeCalled,
  onToggleSelect: shouldNeverBeCalled,
  openGiftBadge: shouldNeverBeCalled,
  openLink: shouldNeverBeCalled,
  previews: [],
  retryMessageSend: shouldNeverBeCalled,
  sendPollVote: shouldNeverBeCalled,
  endPoll: shouldNeverBeCalled,
  pushPanelForConversation: shouldNeverBeCalled,
  renderAudioAttachment: () => <div />,
  renderingContext: 'EditHistoryMessagesModal' as const,
  saveAttachment: shouldNeverBeCalled,
  saveAttachments: shouldNeverBeCalled,
  scrollToQuotedMessage: shouldNeverBeCalled,
  shouldCollapseAbove: false,
  shouldCollapseBelow: false,
  shouldHideMetadata: false,
  showContactModal: shouldNeverBeCalled,
  showConversation: noop,
  showEditHistoryModal: noop,
  showAttachmentDownloadStillInProgressToast: shouldNeverBeCalled,
  showExpiredIncomingTapToViewToast: shouldNeverBeCalled,
  showExpiredOutgoingTapToViewToast: shouldNeverBeCalled,
  showLightboxForViewOnceMedia: shouldNeverBeCalled,
  showMediaNoLongerAvailableToast: shouldNeverBeCalled,
  showTapToViewNotAvailableModal: shouldNeverBeCalled,
  startConversation: shouldNeverBeCalled,
  textDirection: TextDirection.Default,
  viewStory: shouldNeverBeCalled,
};

export function EditHistoryMessagesModal({
  cancelAttachmentDownload,
  closeEditHistoryModal,
  getPreferredBadge,
  editHistoryMessages,
  i18n,
  platform,
  kickOffAttachmentDownload,
  showLightbox,
}: PropsType): JSX.Element {
  const containerElementRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();

  const closeAndShowLightbox = useCallback(
    (options: { attachment: AttachmentType; messageId: string }) => {
      closeEditHistoryModal();
      showLightbox(options);
    },
    [closeEditHistoryModal, showLightbox]
  );

  // These states aren't in redux; they are meant to last only as long as this dialog.
  const [revealedSpoilersById, setRevealedSpoilersById] = useState<
    Record<string, Record<number, boolean> | undefined>
  >({});
  const [displayLimitById, setDisplayLimitById] = useState<
    Record<string, number | undefined>
  >({});

  const [showChanges, setShowChanges] = useState(true);

  const [currentMessage, ...pastEdits] = editHistoryMessages;
  strictAssert(currentMessage, 'Missing currentMessage');
  const currentMessageId = `${currentMessage.id}.${currentMessage.timestamp}`;

  let previousItem = currentMessage;

  return (
    <AxoDialog.Root open onOpenChange={closeEditHistoryModal}>
      <AxoDialog.Content size="md" escape="cancel-is-noop">
        <AxoDialog.Header>
          <AxoDialog.Title screenReaderOnly>
            {i18n('icu:EditHistoryMessagesModal__title')}
          </AxoDialog.Title>
          <AxoDialog.Close />
        </AxoDialog.Header>
        <AxoDialog.Body>
          <div ref={containerElementRef} className="EditHistoryMessagesModal">
            <TimelineDateHeader
              i18n={i18n}
              timestamp={currentMessage.timestamp}
            />
            <Message
              {...MESSAGE_DEFAULT_PROPS}
              {...currentMessage}
              id={currentMessageId}
              containerElementRef={containerElementRef}
              displayLimit={displayLimitById[currentMessageId]}
              getPreferredBadge={getPreferredBadge}
              i18n={i18n}
              interactivity={MessageInteractivity.Static}
              isEditedMessage
              isSpoilerExpanded={revealedSpoilersById[currentMessageId] || {}}
              key={currentMessage.timestamp}
              kickOffAttachmentDownload={() =>
                kickOffAttachmentDownload({ messageId: currentMessage.id })
              }
              cancelAttachmentDownload={() =>
                cancelAttachmentDownload({ messageId: currentMessage.id })
              }
              messageExpanded={(messageId, displayLimit) => {
                const update = {
                  ...displayLimitById,
                  [messageId]: displayLimit,
                };
                setDisplayLimitById(update);
              }}
              platform={platform}
              showLightbox={closeAndShowLightbox}
              showSpoiler={(messageId, data) => {
                const update = {
                  ...revealedSpoilersById,
                  [messageId]: data,
                };
                setRevealedSpoilersById(update);
              }}
              theme={theme}
              renderMessageContextMenu={(
                _renderer: AxoMenuBuilder.Renderer,
                children
              ) => {
                return (
                  <EditHistoryMessageContextMenu
                    i18n={i18n}
                    timestamp={currentMessage.timestamp}
                  >
                    {children}
                  </EditHistoryMessageContextMenu>
                );
              }}
            />

            <hr className="EditHistoryMessagesModal__divider" />

            <div className="EditHistoryMessagesModal__beacon-title-row">
              <h3 className="EditHistoryMessagesModal__title">
                {i18n('icu:EditHistoryMessagesModal__title')}
              </h3>
              <label className="EditHistoryMessagesModal__beacon-toggle">
                <input
                  type="checkbox"
                  checked={showChanges}
                  onChange={ev => setShowChanges(ev.target.checked)}
                />
                Show changes
              </label>
            </div>

            {pastEdits.map((messageAttributes, index) => {
              const newerText =
                (index === 0 ? currentMessage : pastEdits[index - 1])?.text ??
                '';
              const syntheticId = `${messageAttributes.id}.${messageAttributes.timestamp}`;

              const shouldShowDateHeader =
                !previousItem ||
                // This comparison avoids strange header behavior for out-of-order messages.
                (messageAttributes.timestamp > previousItem.timestamp &&
                  !isSameDay(
                    previousItem.timestamp,
                    messageAttributes.timestamp
                  ));
              const dateHeaderElement = shouldShowDateHeader ? (
                <TimelineDateHeader
                  i18n={i18n}
                  timestamp={messageAttributes.timestamp}
                />
              ) : null;

              previousItem = messageAttributes;

              return (
                <Fragment key={messageAttributes.timestamp}>
                  {dateHeaderElement}
                  <Message
                    {...MESSAGE_DEFAULT_PROPS}
                    {...messageAttributes}
                    id={syntheticId}
                    interactivity={MessageInteractivity.Static}
                    containerElementRef={containerElementRef}
                    displayLimit={displayLimitById[syntheticId]}
                    getPreferredBadge={getPreferredBadge}
                    i18n={i18n}
                    isSpoilerExpanded={revealedSpoilersById[syntheticId] || {}}
                    kickOffAttachmentDownload={() =>
                      kickOffAttachmentDownload({
                        messageId: currentMessage.id,
                      })
                    }
                    cancelAttachmentDownload={() =>
                      cancelAttachmentDownload({ messageId: currentMessage.id })
                    }
                    messageExpanded={(messageId, displayLimit) => {
                      const update = {
                        ...displayLimitById,
                        [messageId]: displayLimit,
                      };
                      setDisplayLimitById(update);
                    }}
                    platform={platform}
                    showLightbox={closeAndShowLightbox}
                    showSpoiler={(messageId, data) => {
                      const update = {
                        ...revealedSpoilersById,
                        [messageId]: data,
                      };
                      setRevealedSpoilersById(update);
                    }}
                    theme={theme}
                    renderMessageContextMenu={(
                      _renderer: AxoMenuBuilder.Renderer,
                      children
                    ) => {
                      return (
                        <EditHistoryMessageContextMenu
                          i18n={i18n}
                          timestamp={messageAttributes.timestamp}
                        >
                          {children}
                        </EditHistoryMessageContextMenu>
                      );
                    }}
                  />
                  {showChanges ? (
                    <BeaconEditDiff
                      before={messageAttributes.text ?? ''}
                      after={newerText}
                    />
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        </AxoDialog.Body>
      </AxoDialog.Content>
    </AxoDialog.Root>
  );
}

function BeaconEditDiff({
  before,
  after,
}: {
  before: string;
  after: string;
}): JSX.Element | null {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  if (before === after) {
    return null;
  }
  return (
    <div className="EditHistoryMessagesModal__beacon-diff">
      <span className="EditHistoryMessagesModal__beacon-diff__label">
        Changed to
      </span>
      <span className="EditHistoryMessagesModal__beacon-diff__text">
        {parts.map((part, i) => (
          <span
            // oxlint-disable-next-line react/no-array-index-key
            key={i}
            className={`EditHistoryMessagesModal__beacon-diff__${part.type}`}
          >
            {part.text}
          </span>
        ))}
      </span>
    </div>
  );
}

function EditHistoryMessageContextMenu(props: {
  i18n: LocalizerType;
  timestamp: number;
  children: ReactNode;
}) {
  const { i18n, timestamp } = props;

  const onCopyTimestamp = useCallback(() => {
    drop(window.navigator.clipboard.writeText(`${timestamp}`));
  }, [timestamp]);

  return (
    <AxoContextMenu.Root>
      <AxoContextMenu.Trigger>{props.children}</AxoContextMenu.Trigger>
      <AxoContextMenu.Content>
        <AxoContextMenu.Item symbol="copy" onSelect={onCopyTimestamp}>
          {i18n(
            'icu:EditHistoryMessagesModal__Message__ContextMenu__CopyTimestamp'
          )}
        </AxoContextMenu.Item>
      </AxoContextMenu.Content>
    </AxoContextMenu.Root>
  );
}
