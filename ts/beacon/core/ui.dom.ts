// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Imperative UI helpers shared by the addon context and the command system.
 * Class names match stylesheets/_beacon-theme.scss.
 */

import type {
  ModalAPI,
  ModalOptions,
  UIElementOptions,
} from './types.dom.ts';

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m] ?? m);
}

export function showNotification(
  text: string,
  type: 'info' | 'warning' | 'error' | 'success' = 'info'
): void {
  const notif = document.createElement('div');
  notif.className = `addon-notification addon-notification--${type}`;
  notif.textContent = text;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 4000);
}

export function createElement(options: UIElementOptions): HTMLElement {
  const el = document.createElement(options.tag);
  if (options.className) {
    el.className = options.className;
  }
  if (options.id) {
    el.id = options.id;
  }
  if (options.text) {
    el.textContent = options.text;
  }
  if (options.html) {
    el.innerHTML = options.html;
  }
  if (options.onClick) {
    el.addEventListener('click', options.onClick);
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      el.setAttribute(key, value);
    }
  }
  options.children?.forEach(child => el.appendChild(child));
  return el;
}

export function createModal(options: ModalOptions): ModalAPI {
  const modal = document.createElement('div');
  modal.className = 'addon-modal';
  modal.innerHTML = `
    <div class="addon-modal__overlay"></div>
    <div class="addon-modal__content">
      <div class="addon-modal__header">
        <h2 class="addon-modal__title">${escapeHtml(options.title)}</h2>
        <button class="addon-modal__close">&times;</button>
      </div>
      <div class="addon-modal__body"></div>
      <div class="addon-modal__actions"></div>
    </div>
  `;

  document.body.appendChild(modal);

  const body = modal.querySelector('.addon-modal__body') as HTMLElement;
  const actionsContainer = modal.querySelector(
    '.addon-modal__actions'
  ) as HTMLElement;
  const closeBtn = modal.querySelector('.addon-modal__close') as HTMLElement;

  const setContent = (content: string | HTMLElement) => {
    if (typeof content === 'string') {
      body.textContent = content;
    } else {
      body.innerHTML = '';
      body.appendChild(content);
    }
  };
  setContent(options.content);

  const addAction = (action: NonNullable<ModalOptions['actions']>[0]) => {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.className = `addon-modal__button addon-modal__button--${action.variant || 'secondary'}`;
    btn.addEventListener('click', () => {
      void action.onClick();
    });
    actionsContainer.appendChild(btn);
  };
  options.actions?.forEach(addAction);

  const close = () => {
    modal.remove();
    options.onClose?.();
  };

  closeBtn.addEventListener('click', close);
  modal
    .querySelector('.addon-modal__overlay')
    ?.addEventListener('click', close);

  return {
    close,
    setContent,
    setTitle: title => {
      const titleEl = modal.querySelector('.addon-modal__title');
      if (titleEl) {
        titleEl.textContent = title;
      }
    },
    addAction,
  };
}
