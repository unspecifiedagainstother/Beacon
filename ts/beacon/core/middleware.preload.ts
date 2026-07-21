// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Beacon Redux middleware — the spine of the addon platform.
 *
 * Installed once in createStore. Gives addons:
 *  - interception: rewrite or cancel any action before reducers run
 *  - onActionDispatched / onStateChanged firehose hooks
 *  - derived high-level hooks (message received/sent/changed/deleted,
 *    conversation selected, theme changed) — real payloads straight from the
 *    actions the app itself dispatches, so there is nothing to poll and no
 *    DOM scraping.
 *
 * Everything is guarded: a broken addon can never stall the dispatch chain.
 */

import type { Middleware, UnknownAction } from 'redux';
import type { StateType } from '../../state/reducer.preload.ts';
import type { ReadonlyMessageAttributesType } from '../../model-types.d.ts';
import {
  MESSAGE_CHANGED,
  MESSAGE_DELETED,
  TARGETED_CONVERSATION_CHANGED,
} from '../../state/ducks/conversations.preload.ts';
import { createLogger } from '../../logging/log.std.ts';
import type {
  ActionInterceptor,
  Disposer,
  MessageInterceptor,
  NotificationInterceptor,
} from './types.dom.ts';
import type { HookBus } from './hook-bus.std.ts';

const log = createLogger('beacon/middleware');

type InterceptorEntry = { type: string; interceptor: ActionInterceptor };

const actionInterceptors = new Set<InterceptorEntry>();
const messageInterceptors = new Set<MessageInterceptor>();
const notificationInterceptors = new Set<NotificationInterceptor>();

let actionCount = 0;

export function registerActionInterceptor(
  type: string,
  interceptor: ActionInterceptor
): Disposer {
  const entry: InterceptorEntry = { type, interceptor };
  actionInterceptors.add(entry);
  return () => {
    actionInterceptors.delete(entry);
  };
}

export function registerMessageInterceptor(
  interceptor: MessageInterceptor
): Disposer {
  messageInterceptors.add(interceptor);
  return () => {
    messageInterceptors.delete(interceptor);
  };
}

export function registerNotificationInterceptor(
  interceptor: NotificationInterceptor
): Disposer {
  notificationInterceptors.add(interceptor);
  return () => {
    notificationInterceptors.delete(interceptor);
  };
}

export function runMessageInterceptors(
  msg: unknown
): ReadonlyMessageAttributesType | null {
  let current = msg as ReadonlyMessageAttributesType;
  for (const interceptor of messageInterceptors) {
    if (current == null) {
      break;
    }
    try {
      const result = interceptor(current);
      // oxlint-disable-next-line eqeqeq
      if (result === null) {
        return null;
      }
      current = result;
    } catch (error) {
      log.error('message interceptor error:', error);
    }
  }
  return current;
}

export function runNotificationInterceptors(info: {
  title: string;
  body?: string;
  tag?: string;
  urgency?: string;
}): boolean {
  for (const interceptor of notificationInterceptors) {
    try {
      if (
        interceptor(
          info as {
            title: string;
            body?: string;
            tag?: string;
            urgency?: 'low' | 'normal' | 'high';
          }
        )
      ) {
        return true;
      }
    } catch (error) {
      log.error('notification interceptor error:', error);
    }
  }
  return false;
}

let bus: HookBus | undefined;

/** Called by the runtime once the bus exists. */
export function attachHookBus(hookBus: HookBus): void {
  bus = hookBus;
  log.info('hook bus attached');
}

function emitDerivedHooks(
  action: UnknownAction,
  prevState: StateType,
  nextState: StateType
): void {
  if (!bus) {
    return;
  }

  switch (action.type) {
    case 'MESSAGES_ADDED': {
      const payload = action.payload as {
        conversationId: string;
        isNewMessage: boolean;
        messages: ReadonlyArray<ReadonlyMessageAttributesType>;
      };
      if (!payload?.isNewMessage) {
        break;
      }
      for (const message of payload.messages) {
        const info = {
          conversationId: payload.conversationId,
          isNewMessage: payload.isNewMessage,
        };
        if (message.type === 'incoming') {
          bus.emit('onMessageReceived', message, info);
        } else if (message.type === 'outgoing') {
          bus.emit('onMessageSent', message, info);
        }
      }
      break;
    }
    case MESSAGE_CHANGED: {
      const payload = action.payload as {
        id: string;
        conversationId: string;
        data: ReadonlyMessageAttributesType;
      };
      if (payload?.data) {
        bus.emit('onMessageChanged', payload.data, {
          id: payload.id,
          conversationId: payload.conversationId,
        });
      }
      break;
    }
    case MESSAGE_DELETED: {
      const payload = action.payload as { id: string; conversationId: string };
      if (payload) {
        log.info('emitting onMessageDeleted:', payload.id);
        bus.emit('onMessageDeleted', payload);
      }
      break;
    }
    case TARGETED_CONVERSATION_CHANGED: {
      const payload = action.payload as { conversationId?: string };
      bus.emit('onConversationSelected', payload?.conversationId);
      break;
    }
    default:
      break;
  }

  const prevTheme = prevState.user?.theme;
  const nextTheme = nextState.user?.theme;
  if (prevTheme !== nextTheme && nextTheme != null) {
    bus.emit('onThemeChanged', nextTheme);
  }
}

export const beaconMiddleware: Middleware =
  storeApi => next => rawAction => {
    let action = rawAction as UnknownAction;

    actionCount += 1;
    if (actionCount % 100 === 0) {
      log.info(`middleware active: ${actionCount} actions processed`);
    }

    // Interceptors only see plain actions; thunks/promises pass through
    // untouched — addons wanting those can patch dispatch itself.
    if (typeof action === 'object' && action != null && 'type' in action) {
      for (const entry of Array.from(actionInterceptors)) {
        if (entry.type !== '*' && entry.type !== action.type) {
          continue;
        }
        try {
          const result = entry.interceptor(
            action as { type: string; payload?: unknown }
          );
          // null cancels; undefined (forgotten return) passes unchanged.
          // oxlint-disable-next-line eqeqeq
          if (result === null) {
            return action; // cancelled — reducers never see it
          }
          if (result && typeof result.type === 'string') {
            action = result as UnknownAction;
          }
        } catch (error) {
          log.error('action interceptor error:', error);
        }
      }

      try {
        if (!bus) {
          log.warn('bus not attached, onActionDispatched not emitted');
        } else {
          bus.emit('onActionDispatched', {
            type: action.type,
            payload: (action as { payload?: unknown }).payload,
          });
        }
      } catch (error) {
        log.error('onActionDispatched emit error:', error);
      }
    }

    const prevState = storeApi.getState() as StateType;
    const result = next(action);
    const nextState = storeApi.getState() as StateType;

    if (typeof action === 'object' && action != null && 'type' in action) {
      try {
        emitDerivedHooks(action, prevState, nextState);
        bus?.emit('onStateChanged', {
          action: { type: action.type },
          state: nextState,
        });
      } catch (error) {
        log.error('hook emission error:', error);
      }
    }

    return result;
  };
