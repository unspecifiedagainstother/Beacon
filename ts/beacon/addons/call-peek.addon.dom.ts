// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Call Peek — see who is in a group call without joining.
 *
 * Signal already "peeks" group calls (that is how the Join button knows a
 * call is running): it asks the call server for the participant list, and
 * the people in the call are not told. This addon shows that list:
 *  - an avatar stack and count just left of the Join button,
 *  - an "Ongoing call" bar under the pinned messages with up to six avatars
 *    and "and N others".
 * While a call is running in the open chat it re-peeks every few seconds so
 * the list stays current — the same request Signal makes on its own.
 */

import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import type { StateType } from '../../state/reducer.preload.ts';
import type { ConversationType } from '../../state/ducks/conversations.preload.ts';
import { ICON_CALL_PEEK } from './icons.std.ts';
import { CallMode } from '../../types/CallDisposition.std.ts';
import { GroupCallJoinState } from '../../types/Calling.std.ts';
import { AvatarColorMap } from '../../types/Colors.std.ts';
import { getSelectedConversationId } from '../../state/selectors/nav.std.ts';

type Peek = {
  callMode: CallMode;
  participants: Array<ConversationType>;
  /** Devices in the call that we could not match to a contact. */
  unknownCount: number;
};

function getPeek(state: StateType, conversationId: string): Peek | undefined {
  const call = state.calling.callsByConversation[conversationId];
  if (!call || call.callMode === CallMode.Direct) {
    return undefined;
  }
  if (call.joinState !== GroupCallJoinState.NotJoined) {
    // You're in it (or joining) — Signal's own call UI takes over.
    return undefined;
  }
  const acis = call.peekInfo?.acis ?? [];
  if (acis.length === 0) {
    return undefined;
  }
  const lookup = state.conversations.conversationLookup;
  const participants: Array<ConversationType> = [];
  let unknownCount = 0;
  for (const aci of acis) {
    const model = window.ConversationController.get(aci);
    const conversation = model ? lookup[model.id] : undefined;
    if (conversation) {
      participants.push(conversation);
    } else {
      unknownCount += 1;
    }
  }
  return { callMode: call.callMode, participants, unknownCount };
}

function peekKey(peek: Peek | undefined): string {
  return peek
    ? `${peek.participants.map(p => `${p.id}:${p.avatarUrl ?? ''}`).join(',')}|${peek.unknownCount}`
    : '';
}

function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  return (
    (
      (parts[0]?.charAt(0) ?? '') +
      (parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : '')
    ).toUpperCase() || '?'
  );
}

function avatar(ctx: AddonContext, person: ConversationType): HTMLElement {
  const el = ctx.ui.createElement({
    tag: 'span',
    className: 'BeaconCallPeek__avatar',
    attrs: { title: person.title },
  });
  if (person.avatarUrl) {
    el.append(
      ctx.ui.createElement({
        tag: 'img',
        attrs: { src: person.avatarUrl, alt: '' },
      })
    );
  } else {
    const colors = person.color ? AvatarColorMap.get(person.color) : undefined;
    if (colors) {
      el.style.background = colors.bg;
      el.style.color = colors.fg;
    }
    el.textContent = initials(person.title);
  }
  return el;
}

function totalOf(peek: Peek): number {
  return peek.participants.length + peek.unknownCount;
}

function namesSummary(peek: Peek, max: number): string {
  const names = peek.participants
    .slice(0, max)
    .map(p => p.firstName || p.title);
  const rest = totalOf(peek) - names.length;
  if (rest <= 0) {
    if (names.length <= 1) {
      return names[0] ?? '';
    }
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  }
  return `${names.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}

export default {
  id: 'call-peek',
  icon: ICON_CALL_PEEK,
  name: 'Call Peek',
  version: '1.0.0',
  description:
    'See who is in a group call before joining — next to Join and in a bar under pinned messages. They are not notified.',
  authors: ['Beacon'],
  tags: ['chat', 'privacy'],
  settings: [
    {
      key: 'header',
      type: 'toggle',
      label: 'Show avatars next to Join',
      defaultValue: true,
    },
    {
      key: 'banner',
      type: 'toggle',
      label: 'Show “Ongoing call” bar',
      defaultValue: true,
    },
    {
      key: 'refreshSeconds',
      type: 'number',
      label: 'Refresh every (seconds)',
      description:
        'How often to re-check who is in the call while the chat is open.',
      defaultValue: 10,
      min: 5,
      max: 120,
    },
  ],

  start(ctx) {
    // Re-render a slot whenever its conversation's peek result changes.
    const refreshers = new Set<() => void>();
    ctx.settings.onChange(() => refreshers.forEach(refresh => refresh()));

    const mount = (
      container: HTMLElement,
      conversationId: string,
      settingKey: string,
      draw: (peek: Peek) => Array<HTMLElement>
    ) => {
      let last = '\u0000';
      const update = (force = false) => {
        const peek = ctx.settings.get<boolean>(settingKey)
          ? getPeek(ctx.redux.getState(), conversationId)
          : undefined;
        const key = peekKey(peek);
        if (key === last && !force) {
          return;
        }
        last = key;
        container.replaceChildren(...(peek ? draw(peek) : []));
      };
      const refresh = () => update(true);
      refreshers.add(refresh);
      update();
      const unsubscribe = ctx.redux.subscribe(() => update());
      return () => {
        refreshers.delete(refresh);
        unsubscribe();
      };
    };

    ctx.ui.slot(
      'conversation.header.beforeCall',
      (container, { conversationId }) =>
        mount(container, conversationId, 'header', peek => {
          const stack = ctx.ui.createElement({
            tag: 'span',
            className: 'BeaconCallPeek__stack',
            attrs: {
              title: `In this call: ${namesSummary(peek, 20)}`,
              'aria-label': `${totalOf(peek)} in this call: ${namesSummary(peek, 20)}`,
            },
          });
          peek.participants
            .slice(0, 3)
            .forEach(p => stack.append(avatar(ctx, p)));
          stack.append(
            ctx.ui.createElement({
              tag: 'span',
              className: 'BeaconCallPeek__count',
              text: String(totalOf(peek)),
            })
          );
          return [stack];
        })
    );

    ctx.ui.slot('conversation.belowPinned', (container, { conversationId }) =>
      mount(container, conversationId, 'banner', peek => {
        const bar = ctx.ui.createElement({
          tag: 'div',
          className: 'BeaconCallPeek__bar',
          attrs: { role: 'status' },
        });
        const avatars = ctx.ui.createElement({
          tag: 'span',
          className: 'BeaconCallPeek__avatars',
        });
        peek.participants
          .slice(0, 6)
          .forEach(p => avatars.append(avatar(ctx, p)));
        const overflow = totalOf(peek) - Math.min(6, peek.participants.length);

        const text = ctx.ui.createElement({
          tag: 'span',
          className: 'BeaconCallPeek__text',
        });
        text.append(
          ctx.ui.createElement({
            tag: 'span',
            className: 'BeaconCallPeek__title',
            text: 'Ongoing call',
          }),
          ctx.ui.createElement({
            tag: 'span',
            className: 'BeaconCallPeek__names',
            text: namesSummary(peek, 6),
          })
        );
        bar.append(
          ctx.ui.createElement({
            tag: 'span',
            className: 'BeaconCallPeek__dot',
          }),
          avatars,
          ...(overflow > 0
            ? [
                ctx.ui.createElement({
                  tag: 'span',
                  className: 'BeaconCallPeek__more',
                  text: `and ${overflow} other${overflow === 1 ? '' : 's'}`,
                }),
              ]
            : []),
          text
        );
        return [bar];
      })
    );

    // Keep the open chat's peek fresh while it has a call.
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      clearInterval(timer);
      timer = setInterval(
        () => {
          const state = ctx.redux.getState();
          const conversationId = getSelectedConversationId(state);
          if (!conversationId) {
            return;
          }
          const call = state.calling.callsByConversation[conversationId];
          if (
            call &&
            call.callMode !== CallMode.Direct &&
            call.joinState === GroupCallJoinState.NotJoined &&
            (call.peekInfo?.deviceCount ?? 0) > 0
          ) {
            ctx.signal.reduxActions.calling.peekNotConnectedGroupCall({
              conversationId,
              callMode: call.callMode,
            });
          }
        },
        ctx.settings.get<number>('refreshSeconds') * 1000
      );
    };
    schedule();
    ctx.settings.onChange(key => {
      if (key === 'refreshSeconds') {
        schedule();
      }
    });
    ctx.onDispose(() => clearInterval(timer));

    ctx.css.inject(`
.BeaconCallPeek__stack {
  display: inline-flex; align-items: center; padding: 2px 8px 2px 2px;
  border-radius: 999px; background: var(--axo-color-fill-secondary);
}
.BeaconCallPeek__stack .BeaconCallPeek__avatar { width: 24px; height: 24px; font-size: 10px; }
.BeaconCallPeek__stack .BeaconCallPeek__avatar + .BeaconCallPeek__avatar { margin-inline-start: -8px; }
.BeaconCallPeek__count { margin-inline-start: 6px; font-size: 0.8125rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.BeaconCallPeek__avatar {
  display: inline-grid; flex-shrink: 0; place-items: center; overflow: hidden;
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid var(--axo-color-surface-primary);
  font-size: 11px; font-weight: 600;
  color: var(--axo-color-label-secondary); background: var(--axo-color-fill-secondary);
}
.BeaconCallPeek__avatar img { width: 100%; height: 100%; object-fit: cover; }
.BeaconCallPeek__bar {
  display: flex; align-items: center; gap: 10px; min-width: 0;
  padding: 8px 16px; border-bottom: 1px solid var(--axo-color-border-primary);
  background: color-mix(in srgb, #3fb950 8%, var(--axo-color-surface-primary));
}
.BeaconCallPeek__dot {
  flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: #3fb950;
  box-shadow: 0 0 0 3px color-mix(in srgb, #3fb950 25%, transparent);
}
.BeaconCallPeek__avatars { display: inline-flex; flex-shrink: 0; }
.BeaconCallPeek__avatars .BeaconCallPeek__avatar + .BeaconCallPeek__avatar { margin-inline-start: -6px; }
.BeaconCallPeek__more { flex-shrink: 0; font-size: 0.8125rem; color: var(--axo-color-label-secondary); }
.BeaconCallPeek__text { display: flex; flex-direction: column; min-width: 0; }
.BeaconCallPeek__title { font-size: 0.8125rem; font-weight: 600; }
.BeaconCallPeek__names {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 0.75rem; color: var(--axo-color-label-secondary);
}
`);
  },
} satisfies AddonManifest;
