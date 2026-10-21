// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Promise-based dialogs on top of createModal(): confirm, choose, password.
 * Each resolves once — closing the dialog counts as cancel.
 */

import { createElement, createModal } from './ui.dom.ts';

export type ConfirmOptions = {
  title: string;
  body: string | HTMLElement;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const modal = createModal({
      title: options.title,
      content: options.body,
      onClose: () => finish(false),
      actions: [
        {
          label: options.cancelLabel ?? 'Cancel',
          onClick: () => {
            finish(false);
            modal.close();
          },
        },
        {
          label: options.confirmLabel ?? 'Continue',
          variant: options.destructive ? 'destructive' : 'primary',
          onClick: () => {
            finish(true);
            modal.close();
          },
        },
      ],
    });
  });
}

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

/** A list of radio-like buttons; resolves with the picked value. */
export function askChoice<T extends string>(options: {
  title: string;
  intro?: string;
  choices: ReadonlyArray<ChoiceOption<T>>;
  current?: T;
}): Promise<T | undefined> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: T | undefined) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const list = createElement({ tag: 'div', className: 'BeaconChoice' });
    if (options.intro) {
      list.appendChild(
        createElement({
          tag: 'p',
          className: 'BeaconChoice__intro',
          text: options.intro,
        })
      );
    }
    const modal = createModal({
      title: options.title,
      content: list,
      onClose: () => finish(undefined),
    });
    for (const choice of options.choices) {
      const button = createElement({
        tag: 'button',
        className: `BeaconChoice__option${
          choice.value === options.current
            ? ' BeaconChoice__option--current'
            : ''
        }`,
        attrs: { type: 'button' },
        children: [
          createElement({
            tag: 'span',
            className: 'BeaconChoice__label',
            text: choice.label,
          }),
          ...(choice.description
            ? [
                createElement({
                  tag: 'span',
                  className: 'BeaconChoice__description',
                  text: choice.description,
                }),
              ]
            : []),
        ],
        onClick: () => {
          finish(choice.value);
          modal.close();
        },
      });
      list.appendChild(button);
    }
  });
}

/**
 * Ask for a password. With `confirm`, a second field must match and the
 * password must be at least `minLength` characters.
 */
export function askPassword(options: {
  title: string;
  intro?: string;
  confirm?: boolean;
  minLength?: number;
  submitLabel?: string;
}): Promise<string | undefined> {
  return askInput({ ...options, inputType: 'password' });
}

/** A single line of plain text; empty is allowed. */
export function askText(options: {
  title: string;
  intro?: string;
  initial?: string;
  placeholder?: string;
  submitLabel?: string;
}): Promise<string | undefined> {
  return askInput({ ...options, inputType: 'text', minLength: 0 });
}

function askInput(options: {
  title: string;
  intro?: string;
  confirm?: boolean;
  minLength?: number;
  submitLabel?: string;
  inputType: 'password' | 'text';
  initial?: string;
  placeholder?: string;
}): Promise<string | undefined> {
  const minLength = options.minLength ?? (options.confirm ? 8 : 1);
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: string | undefined) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const field = (placeholder: string) =>
      createElement({
        tag: 'input',
        className: 'BeaconInput',
        attrs: {
          type: options.inputType,
          placeholder,
          autocomplete:
            options.inputType === 'password' ? 'new-password' : 'off',
          spellcheck: 'false',
        },
      }) as HTMLInputElement;

    const first = field(options.placeholder ?? 'Password');
    first.value = options.initial ?? '';
    const second = options.confirm ? field('Repeat password') : undefined;
    const error = createElement({ tag: 'p', className: 'BeaconPrompt__error' });
    error.hidden = true;

    const form = createElement({
      tag: 'form',
      className: 'BeaconPrompt',
      children: [
        ...(options.intro
          ? [
              createElement({
                tag: 'p',
                className: 'BeaconPrompt__intro',
                text: options.intro,
              }),
            ]
          : []),
        first,
        ...(second ? [second] : []),
        error,
      ],
    });

    const submit = () => {
      const value = first.value;
      let problem: string | undefined;
      if (value.length < minLength) {
        problem = `Use at least ${minLength} characters.`;
      } else if (second && second.value !== value) {
        problem = 'The passwords don’t match.';
      }
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        return;
      }
      finish(value);
      modal.close();
    };

    form.addEventListener('submit', ev => {
      ev.preventDefault();
      submit();
    });

    const modal = createModal({
      title: options.title,
      content: form,
      onClose: () => finish(undefined),
      actions: [
        {
          label: 'Cancel',
          onClick: () => {
            finish(undefined);
            modal.close();
          },
        },
        {
          label: options.submitLabel ?? 'OK',
          variant: 'primary',
          onClick: submit,
        },
      ],
    });
    first.focus();
  });
}
