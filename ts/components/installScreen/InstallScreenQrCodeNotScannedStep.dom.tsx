// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactElement, ReactNode, JSX, KeyboardEvent } from 'react';
import { useCallback, useState, useEffect } from 'react';
import classNames from 'classnames';
import lodash from 'lodash';

import type { LocalizerType } from '../../types/Util.std.ts';
import { InstallScreenQRCodeError } from '../../types/InstallScreen.std.ts';
import { DialogType } from '../../types/Dialogs.std.ts';
import { missingCaseError } from '../../util/missingCaseError.std.ts';
import type { Loadable } from '../../util/loadable.std.ts';
import { LoadingState } from '../../util/loadable.std.ts';
import { drop } from '../../util/drop.std.ts';
import { getEnvironment, Environment } from '../../environment.std.ts';

import { I18n } from '../I18n.dom.tsx';
import { Spinner } from '../Spinner.dom.tsx';
import { BrandedQRCode } from '../BrandedQRCode.dom.tsx';
import { TitlebarDragArea } from '../TitlebarDragArea.dom.tsx';
import { InstallScreenUpdateDialog } from './InstallScreenUpdateDialog.dom.tsx';
import { getClassNamesFor } from '../../util/getClassNamesFor.std.ts';
import type { UpdatesStateType } from '../../state/ducks/updates.preload.ts';
import { AxoAlertDialog } from '../../axo/AxoAlertDialog.dom.tsx';
import { AxoButton } from '../../axo/AxoButton.dom.tsx';
import { ExperimentalAxoSegmentedControl } from '../../axo/AxoSegmentedControl.dom.tsx';
import { tw } from '../../axo/tw.dom.tsx';
import { openLinkInWebBrowser } from '../../util/openLinkInWebBrowser.dom.ts';
import {
  Buttons,
  Description,
  Spacer,
  Title,
} from '../standaloneRegistration/util/StepComponents.dom.tsx';
import { BeaconSetupBrand } from '../BeaconSetupBrand.dom.tsx';

const { noop } = lodash;

// We can't always use destructuring assignment because of the complexity of this props
//   type.

export type PropsType = Readonly<{
  i18n: LocalizerType;
  provisioningUrl: Loadable<string, InstallScreenQRCodeError>;
  hasExpired?: boolean;
  updates: UpdatesStateType;
  currentVersion: string;
  OS: string;
  isStaging: boolean;
  retryGetQrCode: () => void;
  startUpdate: () => void;
  forceCheck: () => void;
  isConfirmingDataDeletion: boolean;
  continueInstallWithDataDeletion: () => void;
  restartInstall: () => void;
  /** Beacon: register this computer as its own account instead of linking. */
  onRegister?: () => void;
}>;

const getQrCodeClassName = getClassNamesFor(
  'module-InstallScreenQrCodeNotScannedStep__qr-code'
);

const SUPPORT_PAGE =
  'https://support.signal.org/hc/articles/360007320551-Linked-Devices';

export function InstallScreenQrCodeNotScannedStep({
  currentVersion,
  hasExpired,
  i18n,
  isStaging,
  OS,
  provisioningUrl,
  retryGetQrCode,
  startUpdate,
  forceCheck,
  isConfirmingDataDeletion,
  restartInstall,
  continueInstallWithDataDeletion,
  updates,
  onRegister,
}: Readonly<PropsType>): ReactElement {
  const [mode, setMode] = useState<'link' | 'register'>('link');
  if (hasExpired || updates.dialogType === DialogType.Downloading) {
    return (
      <InstallScreenUpdateDialog
        i18n={i18n}
        {...updates}
        startUpdate={startUpdate}
        forceCheck={forceCheck}
        currentVersion={currentVersion}
        OS={OS}
      />
    );
  }

  // Beacon: same frame and Axo pieces as the standalone registration screen
  // (StandaloneRegistration.dom.tsx). A segmented control switches between
  // linking to a phone and registering a new account, in place.
  const helpLabel = isStaging
    ? `${i18n('icu:Install__support-link')} · Staging`
    : i18n('icu:Install__support-link');

  return (
    <div
      className={`${tw('flex size-full flex-col overflow-hidden')} BeaconSetup`}
    >
      <TitlebarDragArea />
      <BeaconSetupBrand />
      <Spacer className={tw('h-8')} />
      <div className={tw('relative grow')}>
        <div
          className={`${tw(
            'absolute inset-s-1/2 top-1/2 flex max-h-[calc(100%-32px)] w-143 max-w-[calc(100%-32px)] -translate-1/2 transform flex-col overflow-hidden rounded-[26px] bg-surface-primary'
          )} BeaconSetup__card`}
        >
          <div
            className={tw(
              'flex h-[568px] grow flex-col items-center overflow-x-hidden overflow-y-auto p-6 text-center'
            )}
          >
            {onRegister ? (
              <div className={tw('w-72 max-w-full')}>
                <ExperimentalAxoSegmentedControl.Root
                  variant="track"
                  width="full"
                  itemWidth="equal"
                  value={mode}
                  onValueChange={value => {
                    if (value === 'link' || value === 'register') {
                      setMode(value);
                    }
                  }}
                >
                  <ExperimentalAxoSegmentedControl.Item value="link">
                    <ExperimentalAxoSegmentedControl.ItemText>
                      Link a phone
                    </ExperimentalAxoSegmentedControl.ItemText>
                  </ExperimentalAxoSegmentedControl.Item>
                  <ExperimentalAxoSegmentedControl.Item value="register">
                    <ExperimentalAxoSegmentedControl.ItemText>
                      New account
                    </ExperimentalAxoSegmentedControl.ItemText>
                  </ExperimentalAxoSegmentedControl.Item>
                </ExperimentalAxoSegmentedControl.Root>
              </div>
            ) : null}

            {mode === 'link' || !onRegister ? (
              <>
                <Spacer className={tw('h-6')} />
                <InstallScreenQrCode
                  i18n={i18n}
                  {...provisioningUrl}
                  retryGetQrCode={retryGetQrCode}
                />
                <Spacer className={tw('h-6')} />
                <Title text={i18n('icu:Install__scan-this-code')} />
                <Description>
                  <ol className={tw('list-inside list-decimal text-start')}>
                    <li>{i18n('icu:Install__instructions__1')}</li>
                    <li>
                      <I18n
                        i18n={i18n}
                        id="icu:Install__instructions__2"
                        components={{
                          settings: (
                            <strong className={tw('text-primary')}>
                              {i18n('icu:Install__instructions__2__settings')}
                            </strong>
                          ),
                          linkedDevices: (
                            <strong className={tw('text-primary')}>
                              {i18n('icu:linkedDevices')}
                            </strong>
                          ),
                        }}
                      />
                    </li>
                    <li>
                      <I18n
                        i18n={i18n}
                        id="icu:Install__instructions__3"
                        components={{
                          linkNewDevice: (
                            <strong className={tw('text-primary')}>
                              {i18n('icu:linkNewDevice')}
                            </strong>
                          ),
                        }}
                      />
                    </li>
                  </ol>
                </Description>
                <Spacer className={tw('h-8 grow')} />
                <Buttons
                  leftSideContent={
                    <AxoButton.Root
                      variant="implied-secondary"
                      size="md"
                      onClick={() => openLinkInWebBrowser(SUPPORT_PAGE)}
                    >
                      {helpLabel}
                    </AxoButton.Root>
                  }
                >
                  {null}
                </Buttons>
              </>
            ) : (
              <>
                <Spacer className={tw('h-12')} />
                <Title text="Register this computer" />
                <Description>
                  Use Beacon as its own Signal account. You’ll confirm your
                  phone number with a code sent by text or call, then set a PIN
                  and profile.
                </Description>
                <Spacer className={tw('h-6')} />
                <div
                  className={tw(
                    'w-90.5 max-w-full rounded-xl bg-surface-secondary p-4 text-start type-body-medium text-secondary'
                  )}
                >
                  <div className={tw('mb-1 type-body-medium text-primary')}>
                    Already using Signal on a phone?
                  </div>
                  Registering that number here signs the phone out of Signal. To
                  keep both, link this computer instead.
                </div>
                <Spacer className={tw('h-8 grow')} />
                <Buttons
                  leftSideContent={
                    <AxoButton.Root
                      variant="implied-secondary"
                      size="md"
                      onClick={() => setMode('link')}
                    >
                      Link instead
                    </AxoButton.Root>
                  }
                >
                  <AxoButton.Root
                    variant="strong-primary"
                    size="md"
                    onClick={onRegister}
                  >
                    Continue
                  </AxoButton.Root>
                </Buttons>
              </>
            )}
          </div>
        </div>
      </div>
      {isConfirmingDataDeletion ? (
        <AxoAlertDialog.Root open>
          <AxoAlertDialog.Content escape="cancel-is-destructive">
            <AxoAlertDialog.Body>
              <AxoAlertDialog.Title>
                {i18n('icu:Install__confirm-data-deletion__title')}
              </AxoAlertDialog.Title>
              <AxoAlertDialog.Description>
                {i18n('icu:Install__confirm-data-deletion__body')}
              </AxoAlertDialog.Description>
            </AxoAlertDialog.Body>
            <AxoAlertDialog.Footer>
              <AxoAlertDialog.Action
                variant="strong-secondary"
                onClick={restartInstall}
              >
                {i18n('icu:cancel')}
              </AxoAlertDialog.Action>
              <AxoAlertDialog.Action
                variant="strong-destructive"
                onClick={continueInstallWithDataDeletion}
              >
                {i18n('icu:Install__confirm-data-deletion__continue')}
              </AxoAlertDialog.Action>
            </AxoAlertDialog.Footer>
          </AxoAlertDialog.Content>
        </AxoAlertDialog.Root>
      ) : null}
    </div>
  );
}

function InstallScreenQrCode(
  props: Loadable<string, InstallScreenQRCodeError> & {
    i18n: LocalizerType;
    retryGetQrCode: () => void;
  }
): ReactElement {
  const { i18n, retryGetQrCode } = props;

  let contents: ReactNode;

  const loadError =
    props.loadingState === LoadingState.LoadFailed ? props.error : undefined;

  useEffect(() => {
    if (loadError !== InstallScreenQRCodeError.MaxRotations) {
      return noop;
    }

    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        return;
      }

      cleanup();
      retryGetQrCode();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return cleanup;
  }, [retryGetQrCode, loadError]);

  let isJustButton = false;
  switch (props.loadingState) {
    case LoadingState.Loading:
      contents = <Spinner size="24px" svgSize="small" />;
      break;
    case LoadingState.LoadFailed: {
      const { error } = props;
      switch (error) {
        case InstallScreenQRCodeError.Timeout:
          contents = (
            <>
              <span
                className={classNames(getQrCodeClassName('__error-message'))}
              >
                {i18n('icu:Install__qr-failed-load__error--timeout')}
              </span>
              <RetryButton onClick={retryGetQrCode}>
                {i18n('icu:Install__qr-failed-load__retry')}
              </RetryButton>
            </>
          );
          break;
        case InstallScreenQRCodeError.Unknown:
          contents = (
            <>
              <span
                className={classNames(getQrCodeClassName('__error-message'))}
              >
                <I18n
                  i18n={i18n}
                  id="icu:Install__qr-failed-load__error--unknown"
                  components={{ paragraph: Paragraph }}
                />
              </span>
              <RetryButton onClick={retryGetQrCode}>
                {i18n('icu:Install__qr-failed-load__retry')}
              </RetryButton>
            </>
          );
          break;
        case InstallScreenQRCodeError.NetworkIssue:
          contents = (
            <>
              <span
                className={classNames(getQrCodeClassName('__error-message'))}
              >
                {i18n('icu:Install__qr-failed-load__error--network')}
              </span>

              <a
                className={classNames(getQrCodeClassName('__get-help'))}
                target="_blank"
                rel="noreferrer"
                href={SUPPORT_PAGE}
              >
                {i18n('icu:Install__qr-failed-load__get-help')}
              </a>
            </>
          );
          break;
        case InstallScreenQRCodeError.MaxRotations:
          isJustButton = true;
          contents = (
            <RetryButton onClick={retryGetQrCode}>
              {i18n('icu:Install__qr-max-rotations__retry')}
            </RetryButton>
          );
          break;
        default:
          throw missingCaseError(error);
      }
      break;
    }
    case LoadingState.Loaded:
      contents = <QRCodeImage i18n={i18n} link={props.value} />;
      break;
    default:
      throw missingCaseError(props);
  }

  return (
    <div
      className={classNames(
        getQrCodeClassName(''),
        props.loadingState === LoadingState.Loaded &&
          getQrCodeClassName('--loaded'),
        props.loadingState === LoadingState.LoadFailed &&
          getQrCodeClassName('--load-failed'),
        isJustButton && getQrCodeClassName('--just-button')
      )}
    >
      {contents}
    </div>
  );
}

function QRCodeImage({
  i18n,
  link,
}: {
  i18n: LocalizerType;
  link: string;
}): JSX.Element {
  const [isCopying, setIsCopying] = useState(false);

  // Add a development-only feature to copy a QR code to the clipboard by double-clicking.
  // This can be used to quickly inspect the code, or to link this Desktop with an iOS
  // simulator primary, which has a debug-only option to paste the linking URL instead of
  // scanning it. (By the time you read this comment Android may have a similar feature.)
  const onDoubleClick = useCallback(() => {
    if (getEnvironment() === Environment.PackagedApp) {
      return;
    }

    drop(navigator.clipboard.writeText(link));
    setIsCopying(true);
  }, [link]);

  useEffect(() => {
    if (!isCopying) {
      return noop;
    }

    const timer = setTimeout(() => {
      setIsCopying(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [isCopying]);

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <svg
      role="img"
      aria-label={i18n('icu:Install__scan-this-code')}
      className={classNames(
        getQrCodeClassName('__code'),
        isCopying && getQrCodeClassName('__code--copying')
      )}
      onDoubleClick={onDoubleClick}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <BrandedQRCode size={16} link={link} color="black" />
    </svg>
  );
}

function RetryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  const onKeyDown = useCallback(
    (ev: KeyboardEvent<HTMLButtonElement>) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        onClick();
      }
    },
    [onClick]
  );

  return (
    <button
      className={getQrCodeClassName('__link')}
      onClick={onClick}
      onKeyDown={onKeyDown}
      type="button"
    >
      {children}
    </button>
  );
}

function Paragraph(children: ReactNode): JSX.Element {
  return <p>{children}</p>;
}
