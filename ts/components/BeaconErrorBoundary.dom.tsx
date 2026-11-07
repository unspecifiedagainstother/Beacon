// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode, ErrorInfo } from 'react';
import { Component } from 'react';

import { createLogger } from '../logging/log.std.ts';
import * as Errors from '../types/errors.std.ts';

const log = createLogger('BeaconErrorBoundary');

type Props = Readonly<{
  name: string;
  children: ReactNode;
  fallback?: ReactNode;
}>;

type State = { failed: boolean };

export class BeaconErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error(
      `Beacon UI "${this.props.name}" crashed and was hidden:`,
      Errors.toLogFormat(error),
      info.componentStack
    );
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
