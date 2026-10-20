// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Call Peek — see who is in a group call without joining.
 *
 * Signal already "peeks" group calls (that is how the Join button knows a
 * call is running): it asks the call server for the participant list, and
 * the people in the call are not told. This shows that list in an
 * "Ongoing call" bar under the pinned messages — up to six avatars, then
 * "and N others" — with its own Join button, replacing the header's.
 *
 * While you are in a call, every chat shows a "Call in progress" bar instead,
 * with everyone's avatars (yours first) and a Leave button.
 * While a call is running in the open chat it re-peeks every few seconds so
 * the list stays current — the same request Signal makes on its own.
 */

import type { AddonContext, AddonManifest } from '../core/types.dom.ts';
import type { StateType } from '../../state/reducer.preload.ts';
import type { ConversationType } from '../../state/ducks/conversations.preload.ts';
import { ICON_CALL_PEEK } from '../addons/icons.std.ts';
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

type ActiveCall = {
  conversationId: string;
  chatTitle: string;
  /** You first, then everyone else in the call. */
  participants: Array<ConversationType>;
  unknownCount: number;
};

function getActiveCall(state: StateType): ActiveCall | undefined {
  const active = state.calling.activeCallState;
  if (!active || active.state !== 'Active') {
    return undefined;
  }
  const lookup = state.conversations.conversationLookup;
  const participants: Array<ConversationType> = [];
  const me = state.user.ourConversationId
    ? lookup[state.user.ourConversationId]
    : undefined;
  if (me) {
    participants.push(me);
  }
  let unknownCount = 0;
  const call = state.calling.callsByConversation[active.conversationId];
  if (call && call.callMode !== CallMode.Direct) {
    const seen = new Set<string>();
    for (const { aci } of call.remoteParticipants) {
      if (seen.has(aci)) {
        continue; // several devices of one person
      }
      seen.add(aci);
      const model = window.ConversationController.get(aci);
      const conversation = model ? lookup[model.id] : undefined;
      if (conversation) {
        participants.push(conversation);
      } else {
        unknownCount += 1;
      }
    }
  } else {
    const other = lookup[active.conversationId];
    if (other) {
      participants.push(other);
    }
  }
  return {
    conversationId: active.conversationId,
    chatTitle: lookup[active.conversationId]?.title ?? 'call',
    participants,
    unknownCount,
  };
}

function activeKey(call: ActiveCall | undefined): string {
  return call
    ? `active|${call.conversationId}|${call.chatTitle}|${call.participants
        .map(p => `${p.id}:${p.avatarUrl ?? ''}`)
        .join(',')}|${call.unknownCount}`
    : '';
}

export default {
  id: 'call-peek',
  builtin: true,
  icon: ICON_CALL_PEEK,
  name: 'Call Peek',
  version: '1.1.0',
  description:
    'See who is in a group call before joining (they are not notified), and a “Call in progress” bar with Leave in every chat while you are in one.',
  authors: ['Beacon'],
  tags: ['chat', 'privacy'],
  settings: [
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
    // While our bar is up it carries the Join button; hide the header's.
    const visibleBars = new Set<HTMLElement>();
    const syncHeaderJoin = () =>
      document.body.classList.toggle(
        'Beacon--call-peek-active',
        visibleBars.size > 0
      );
    ctx.onDispose(() =>
      document.body.classList.remove('Beacon--call-peek-active')
    );

    ctx.ui.slot('conversation.belowPinned', (container, { conversationId }) => {
      let last = '\u0000';
      const update = () => {
        const state = ctx.redux.getState();
        // In a call: show it in every chat, with Leave.
        const active = getActiveCall(state);
        if (active) {
          const key = activeKey(active);
          if (key !== last) {
            last = key;
            container.replaceChildren(
              renderActiveBar(ctx, active, conversationId)
            );
          }
          visibleBars.delete(container);
          syncHeaderJoin();
          return;
        }
        const peek = getPeek(state, conversationId);
        const key = peekKey(peek);
        if (key === last) {
          return;
        }
        last = key;
        if (!peek) {
          container.replaceChildren();
          visibleBars.delete(container);
          syncHeaderJoin();
          return;
        }
        container.replaceChildren(renderBar(ctx, peek, conversationId));
        visibleBars.add(container);
        syncHeaderJoin();
      };
      update();
      const unsubscribe = ctx.redux.subscribe(update);
      return () => {
        unsubscribe();
        visibleBars.delete(container);
        syncHeaderJoin();
      };
    });

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
.Beacon--call-peek-active .BeaconHeaderJoin { display: none !important; }
.BeaconCallPeek__bar {
  display: flex; align-items: center; gap: 12px; min-width: 0;
  padding: 10px 16px; border-bottom: 1px solid var(--axo-color-border-primary);
  background: color-mix(in srgb, #2fb344 7%, var(--axo-color-surface-primary));
}
.BeaconCallPeek__avatars { display: inline-flex; flex-shrink: 0; }
.BeaconCallPeek__avatar {
  display: inline-grid; flex-shrink: 0; place-items: center; overflow: hidden;
  width: 36px; height: 36px; border-radius: 50%;
  border: 2px solid var(--axo-color-surface-primary);
  font-size: 13px; font-weight: 600;
  color: var(--axo-color-label-secondary); background: var(--axo-color-fill-secondary);
}
.BeaconCallPeek__avatar img { width: 100%; height: 100%; object-fit: cover; }
.BeaconCallPeek__avatars .BeaconCallPeek__avatar + .BeaconCallPeek__avatar { margin-inline-start: -8px; }
.BeaconCallPeek__more { flex-shrink: 0; font-size: 0.8125rem; color: var(--axo-color-label-secondary); }
.BeaconCallPeek__text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.BeaconCallPeek__title { font-size: 0.875rem; font-weight: 600; }
.BeaconCallPeek__names {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 0.75rem; color: var(--axo-color-label-secondary);
}
.BeaconCallPeek__join {
  display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px;
  height: 32px; padding: 0 16px; border: none; border-radius: 999px;
  font: inherit; font-size: 0.875rem; font-weight: 600; color: #fff;
  background: #2fb344; cursor: pointer;
}
.BeaconCallPeek__join:hover { background: #28a03c; }
.BeaconCallPeek__bar--active {
  background: color-mix(in srgb, var(--beacon-accent) 10%, var(--axo-color-surface-primary));
}
.BeaconCallPeek__leave {
  display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px;
  height: 32px; padding: 0 16px; border: none; border-radius: 999px;
  font: inherit; font-size: 0.875rem; font-weight: 600; color: #fff;
  background: #d92d20; cursor: pointer;
}
.BeaconCallPeek__leave:hover { background: #b42318; }
.BeaconCallPeek__leave:focus-visible { outline: 2px solid var(--beacon-accent); outline-offset: 2px; }
.BeaconCallPeek__leave::before {
  content: ''; width: 16px; height: 16px; background: currentColor;
  mask: url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15.2 15.2 0 0 0 12 9z"/></svg>'
  )}") center / contain no-repeat;
}
.BeaconCallPeek__join:focus-visible { outline: 2px solid var(--beacon-accent); outline-offset: 2px; }
.BeaconCallPeek__join::before {
  content: ''; width: 16px; height: 16px; background: currentColor;
  mask: url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 7h12v10H3z M15 10.5l6-3.5v10l-6-3.5z" fill="#000"/></svg>'
  )}") center / contain no-repeat;
}
`);
  },
} satisfies AddonManifest;

function renderBar(
  ctx: AddonContext,
  peek: Peek,
  conversationId: string
): HTMLElement {
  const el = (tag: string, className: string, text?: string) =>
    ctx.ui.createElement({ tag, className, text });

  const bar = ctx.ui.createElement({
    tag: 'div',
    className: 'BeaconCallPeek__bar',
    attrs: { role: 'status' },
  });

  const avatars = el('span', 'BeaconCallPeek__avatars');
  peek.participants.slice(0, 6).forEach(p => avatars.append(avatar(ctx, p)));
  const overflow = totalOf(peek) - Math.min(6, peek.participants.length);

  const text = el('span', 'BeaconCallPeek__text');
  text.append(
    el('span', 'BeaconCallPeek__title', 'Ongoing call'),
    el('span', 'BeaconCallPeek__names', namesSummary(peek, 6))
  );

  const join = ctx.ui.createElement({
    tag: 'button',
    className: 'BeaconCallPeek__join',
    text: 'Join',
    attrs: { type: 'button', 'aria-label': 'Join call' },
    onClick: () =>
      ctx.signal.reduxActions.calling.onOutgoingVideoCallInConversation(
        conversationId
      ),
  });

  bar.append(
    avatars,
    ...(overflow > 0
      ? [
          el(
            'span',
            'BeaconCallPeek__more',
            `and ${overflow} other${overflow === 1 ? '' : 's'}`
          ),
        ]
      : []),
    text,
    join
  );
  return bar;
}

function renderActiveBar(
  ctx: AddonContext,
  call: ActiveCall,
  viewingConversationId: string
): HTMLElement {
  const el = (tag: string, className: string, text?: string) =>
    ctx.ui.createElement({ tag, className, text });

  const bar = ctx.ui.createElement({
    tag: 'div',
    className: 'BeaconCallPeek__bar BeaconCallPeek__bar--active',
    attrs: { role: 'status' },
  });

  const avatars = el('span', 'BeaconCallPeek__avatars');
  call.participants.slice(0, 6).forEach(p => avatars.append(avatar(ctx, p)));
  const total = call.participants.length + call.unknownCount;
  const overflow = total - Math.min(6, call.participants.length);

  const names = call.participants
    .slice(0, 6)
    .map(p => (p.isMe ? 'You' : p.firstName || p.title));
  const rest = total - names.length;
  let namesText = names.join(', ');
  if (rest > 0) {
    namesText += ` and ${rest} other${rest === 1 ? '' : 's'}`;
  }

  const text = el('span', 'BeaconCallPeek__text');
  text.append(
    el(
      'span',
      'BeaconCallPeek__title',
      call.conversationId === viewingConversationId
        ? 'Call in progress'
        : `Call in progress · ${call.chatTitle}`
    ),
    el('span', 'BeaconCallPeek__names', namesText)
  );

  const leave = ctx.ui.createElement({
    tag: 'button',
    className: 'BeaconCallPeek__leave',
    text: 'Leave',
    attrs: { type: 'button', 'aria-label': 'Leave call' },
    onClick: () =>
      ctx.signal.reduxActions.calling.hangUpActiveCall('beacon: call bar'),
  });

  bar.append(
    avatars,
    ...(overflow > 0
      ? [
          el(
            'span',
            'BeaconCallPeek__more',
            `and ${overflow} other${overflow === 1 ? '' : 's'}`
          ),
        ]
      : []),
    text,
    leave
  );
  return bar;
}
