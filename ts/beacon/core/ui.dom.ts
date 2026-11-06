// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  ModalAPI,
  ModalOptions,
  ToastType,
  UIElementOptions,
} from './types.dom.ts';

const TOAST_MS = 4000;
const MAX_TOASTS = 4;

function getToastStack(): HTMLElement {
  let stack = document.querySelector<HTMLElement>('.BeaconToastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'BeaconToastStack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

export function showNotification(text: string, type: ToastType = 'info'): void {
  const stack = getToastStack();
  while (stack.childElementCount >= MAX_TOASTS) {
    stack.firstElementChild?.remove();
  }

  const toast = document.createElement('div');
  toast.className = `BeaconToast BeaconToast--${type}`;
  toast.textContent = text;
  toast.addEventListener('click', () => toast.remove());
  stack.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('BeaconToast--leaving');
    setTimeout(() => toast.remove(), 200);
  }, TOAST_MS);
}

export function createElement(options: UIElementOptions): HTMLElement {
  const el = document.createElement(options.tag);
  if (options.className) {
    el.className = options.className;
  }
  if (options.id) {
    el.id = options.id;
  }
  if (options.text != null) {
    el.textContent = options.text;
  }
  if (options.onClick) {
    const { onClick } = options;
    el.addEventListener('click', ev => onClick(ev as MouseEvent));
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      el.setAttribute(key, value);
    }
  }
  for (const child of options.children ?? []) {
    el.append(child);
  }
  return el;
}

export function createModal(options: ModalOptions): ModalAPI {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const overlay = createElement({
    tag: 'div',
    className: 'BeaconModal__overlay',
  });
  const title = createElement({
    tag: 'h2',
    className: 'BeaconModal__title',
    text: options.title,
    id: `beacon-modal-${Date.now()}`,
  });
  const closeBtn = createElement({
    tag: 'button',
    className: 'BeaconModal__close',
    attrs: { type: 'button', 'aria-label': 'Close' },
  });
  const header = createElement({
    tag: 'div',
    className: 'BeaconModal__header',
    children: [title, closeBtn],
  });
  const body = createElement({ tag: 'div', className: 'BeaconModal__body' });
  const actions = createElement({
    tag: 'div',
    className: 'BeaconModal__actions',
  });
  const content = createElement({
    tag: 'div',
    className: `BeaconModal__content BeaconModal__content--${options.size ?? 'normal'}`,
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': title.id,
    },
    children: [header, body, actions],
  });
  const modal = createElement({
    tag: 'div',
    className: 'BeaconModal',
    children: [overlay, content],
  });

  document.body.appendChild(modal);

  const setContent = (next: string | HTMLElement) => {
    if (typeof next === 'string') {
      body.textContent = next;
    } else {
      body.replaceChildren(next);
    }
  };
  setContent(options.content);

  const addAction = (action: NonNullable<ModalOptions['actions']>[0]) => {
    const btn = createElement({
      tag: 'button',
      className: `BeaconButton BeaconButton--${action.variant ?? 'secondary'}`,
      text: action.label,
      attrs: { type: 'button' },
      onClick: () => {
        void action.onClick();
      },
    });
    actions.appendChild(btn);
    actions.hidden = false;
  };
  actions.hidden = true;
  options.actions?.forEach(addAction);

  let closed = false;
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    }
  };

  function close() {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    modal.remove();
    previouslyFocused?.focus?.();
    options.onClose?.();
  }

  document.addEventListener('keydown', onKeyDown, true);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  closeBtn.focus();

  return {
    close,
    setContent,
    setTitle: text => {
      title.textContent = text;
    },
    addAction,
  };
}
