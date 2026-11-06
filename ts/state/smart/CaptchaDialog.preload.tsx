// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
import { memo, useCallback } from 'react';
import { openCaptcha } from '../../beacon/core/captcha.dom.ts';
import { useSelector } from 'react-redux';
import { CaptchaDialog } from '../../components/CaptchaDialog.dom.tsx';
import { getIntl } from '../selectors/user.std.ts';
import { isChallengePending } from '../selectors/network.preload.ts';
import { getChallengeURL } from '../../challenge.dom.ts';
import { createLogger } from '../../logging/log.std.ts';

const log = createLogger('CaptchaDialog');

export type SmartCaptchaDialogProps = Readonly<{
  onSkip: () => void;
}>;

export const SmartCaptchaDialog = memo(function SmartCaptchaDialog({
  onSkip,
}: SmartCaptchaDialogProps) {
  const i18n = useSelector(getIntl);
  const isPending = useSelector(isChallengePending);
  const handleContinue = useCallback(() => {
    const url = getChallengeURL('chat');
    log.info(`opening captcha ${url}`);
    openCaptcha('chat', url);
  }, []);
  return (
    <CaptchaDialog
      i18n={i18n}
      pending={isPending}
      onSkip={onSkip}
      onContinue={handleContinue}
    />
  );
});
