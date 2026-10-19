// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Beacon Redux middleware — the spine of the addon platform.
 *
 * Installed once in createStore. Gives addons:
 *  - interception: rewrite or cancel any action before reducers run
 *  - onActionDispatched / onStateChanged firehose hooks
 *  - derived high-level hooks (message received/sent/changed/edited/
 *    deleted, conversation selected, theme changed) — real payloads straight
 *    from the actions the app itself dispatches, so there is nothing to poll
 *    and no DOM scraping.
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
import type { ActionInterceptor, Disposer } from './types.dom.ts';
import type { HookBus } from './hook-bus.std.ts';

const log = createLogger('beacon/middleware');

type InterceptorEntry = { type: string; interceptor: ActionInterceptor };

const actionInterceptors = new Set<InterceptorEntry>();

let bus: HookBus | undefined;

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

/** Called by the runtime once the bus exists. */
export function attachHookBus(hookBus: HookBus): void {
  bus = hookBus;
}

function isPlainAction(action: unknown): action is UnknownAction {
  return (
    typeof action === 'object' &&
    action != null &&
    'type' in action &&
    typeof action.type === 'string'
  );
}

function lookupMessage(
  state: StateType,
  id: string
): ReadonlyMessageAttributesType | undefined {
  return state.conversations?.messagesLookup?.[id];
}

function emitDerivedHooks(
  hookBus: HookBus,
  action: UnknownAction,
  prevState: StateType,
  nextState: StateType
): void {
  switch (action.type) {
    case 'MESSAGES_ADDED': {
      const payload = action.payload as
        | {
            conversationId: string;
            isNewMessage: boolean;
            messages: ReadonlyArray<ReadonlyMessageAttributesType>;
          }
        | undefined;
      if (!payload?.isNewMessage) {
        break;
      }
      const info = {
        conversationId: payload.conversationId,
        isNewMessage: payload.isNewMessage,
      };
      for (const message of payload.messages) {
        if (message.type === 'incoming') {
          hookBus.emit('onMessageReceived', message, info);
        } else if (message.type === 'outgoing') {
          hookBus.emit('onMessageSent', message, info);
        }
      }
      break;
    }
    case MESSAGE_CHANGED: {
      const payload = action.payload as
        | {
            id: string;
            conversationId: string;
            data: ReadonlyMessageAttributesType;
          }
        | undefined;
      if (!payload?.data) {
        break;
      }
      const { id, conversationId, data } = payload;
      const previous = lookupMessage(prevState, id);
      hookBus.emit('onMessageChanged', data, { id, conversationId, previous });

      const prevEdits = previous?.editHistory?.length ?? 0;
      const nextEdits = data.editHistory?.length ?? 0;
      // A first edit takes editHistory from undefined to [new, original].
      if (nextEdits > prevEdits && nextEdits >= 2) {
        hookBus.emit('onMessageEdited', data, { conversationId, previous });
      }

      if (data.deletedForEveryone && !previous?.deletedForEveryone) {
        hookBus.emit('onMessageDeletedForEveryone', data, {
          conversationId,
          previous,
        });
      }
      break;
    }
    case MESSAGE_DELETED: {
      const payload = action.payload as
        | { id: string; conversationId: string }
        | undefined;
      if (payload) {
        hookBus.emit('onMessageDeleted', payload);
      }
      break;
    }
    case TARGETED_CONVERSATION_CHANGED: {
      const payload = action.payload as { conversationId?: string } | undefined;
      hookBus.emit('onConversationSelected', payload?.conversationId);
      break;
    }
    default:
      break;
  }

  const prevTheme = prevState.user?.theme;
  const nextTheme = nextState.user?.theme;
  if (prevTheme !== nextTheme && nextTheme != null) {
    hookBus.emit('onThemeChanged', nextTheme);
  }
}

export const beaconMiddleware: Middleware = storeApi => next => rawAction => {
  // Thunks and promises pass through untouched — they come back here as plain
  // actions once they dispatch.
  if (!isPlainAction(rawAction)) {
    return next(rawAction);
  }

  let action = rawAction;

  for (const entry of Array.from(actionInterceptors)) {
    if (entry.type !== '*' && entry.type !== action.type) {
      continue;
    }
    try {
      const result = entry.interceptor(action);
      // null cancels; undefined (forgotten return) passes unchanged.
      // oxlint-disable-next-line eqeqeq -- must not match undefined
      if (result === null) {
        return action; // cancelled — reducers never see it
      }
      if (result && typeof result.type === 'string') {
        action = result;
      }
    } catch (error) {
      log.error(`action interceptor for ${entry.type} threw:`, error);
    }
  }

  if (!bus) {
    return next(action);
  }
  const hookBus = bus;

  hookBus.emit('onActionDispatched', {
    type: action.type,
    payload: (action as { payload?: unknown }).payload,
  });

  const prevState = storeApi.getState() as StateType;
  const result = next(action);
  const nextState = storeApi.getState() as StateType;

  try {
    emitDerivedHooks(hookBus, action, prevState, nextState);
    hookBus.emit('onStateChanged', {
      action: { type: action.type },
      state: nextState,
    });
  } catch (error) {
    log.error('hook emission error:', error);
  }

  return result;
};
