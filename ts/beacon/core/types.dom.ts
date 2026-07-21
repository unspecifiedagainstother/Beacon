// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Beacon addon platform — public types.
 *
 * Everything an addon can see lives here. The implementation is split across
 * the other files in ts/beacon/core/, but addons should only ever need this
 * module (and only for types — addons receive the live context at start()).
 */

import type { Store } from 'redux';
import type { StateType } from '../../state/reducer.preload.ts';
import type { ReadonlyMessageAttributesType } from '../../model-types.d.ts';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Every hook and its payload. Payloads derived from real Redux actions are
 * typed to the same shapes the reducers see — addons get the actual data, not
 * a summary.
 */
export type HookPayloads = {
  /** All addons loaded, Redux store live. */
  onAppStart: [];
  /** Fired for every Redux action, before reducers run. */
  onActionDispatched: [action: { type: string; payload?: unknown }];
  /** Fired after every Redux action has been reduced. */
  onStateChanged: [info: { action: { type: string }; state: StateType }];
  /** An incoming message was added to the timeline. */
  onMessageReceived: [
    message: ReadonlyMessageAttributesType,
    info: { conversationId: string; isNewMessage: boolean },
  ];
  /** An outgoing message was added to the timeline. */
  onMessageSent: [
    message: ReadonlyMessageAttributesType,
    info: { conversationId: string; isNewMessage: boolean },
  ];
  /** An existing message's attributes changed (edit, status, reactions...). */
  onMessageChanged: [
    message: ReadonlyMessageAttributesType,
    info: { id: string; conversationId: string },
  ];
  /** A message was removed from the timeline. */
  onMessageDeleted: [info: { id: string; conversationId: string }];
  /** A reaction was added to a message. */
  onReactionAdded: [
    reaction: { emoji: string; timestamp: number },
    message: ReadonlyMessageAttributesType,
    info: { conversationId: string },
  ];
  /** A reaction was removed from a message. */
  onReactionRemoved: [
    reaction: { emoji: string },
    message: ReadonlyMessageAttributesType,
    info: { conversationId: string },
  ];
  /** The user targeted (opened) a conversation. undefined = closed. */
  onConversationSelected: [conversationId: string | undefined];
  /** Theme flipped between light/dark/system resolution. */
  onThemeChanged: [theme: string];
};

export type HookName = keyof HookPayloads;

export type HookFn<Name extends HookName = HookName> = (
  ...args: HookPayloads[Name]
) => void | Promise<void>;

/** Returned by every registration; call to undo it. */
export type Disposer = () => void;

// ---------------------------------------------------------------------------
// Action interception
// ---------------------------------------------------------------------------

/**
 * Interceptors run in the Redux middleware, before reducers. Return:
 *  - the action (or a replacement) to let it through,
 *  - null to cancel it entirely.
 * This is the lowest-level control point in the renderer: every UI state
 * change in the app flows through here.
 */
export type ActionInterceptor = (action: {
  type: string;
  payload?: unknown;
}) => { type: string; payload?: unknown } | null;

// ---------------------------------------------------------------------------
// Message/notification interception
// ---------------------------------------------------------------------------

/**
 * Filter or transform messages before render.
 * Return modified message or null to hide it.
 */
export type MessageInterceptor = (
  message: ReadonlyMessageAttributesType
) => ReadonlyMessageAttributesType | null;

/**
 * Suppress notifications by type.
 * Return true to block the notification.
 */
export type NotificationInterceptor = (info: {
  title: string;
  body?: string;
  tag?: string;
  urgency?: 'low' | 'normal' | 'high';
}) => boolean;

// ---------------------------------------------------------------------------
// Patcher
// ---------------------------------------------------------------------------

export type PatchCallbackBefore = (args: Array<unknown>) => Array<unknown> | void;
export type PatchCallbackAfter = (result: unknown, args: Array<unknown>) => unknown;
export type PatchCallbackInstead = (
  args: Array<unknown>,
  original: (...a: Array<unknown>) => unknown
) => unknown;

export type Patcher = {
  /** Run cb before the original; return a new args array to rewrite them. */
  before: (
    obj: object,
    method: string,
    cb: PatchCallbackBefore
  ) => Disposer;
  /** Run cb after the original; return value replaces the result. */
  after: (obj: object, method: string, cb: PatchCallbackAfter) => Disposer;
  /** Replace the original entirely; cb receives it to call (or not). */
  instead: (
    obj: object,
    method: string,
    cb: PatchCallbackInstead
  ) => Disposer;
  /** Remove every patch this patcher instance created. */
  unpatchAll: () => void;
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type CommandContext = {
  /** Args after the command word, whitespace-split. */
  args: Array<string>;
  /** Raw argument string. */
  argsRaw: string;
  /** Conversation the composer belongs to, if any. */
  conversationId: string | undefined;
  /** Insert text into the composer at the cursor. */
  insertText: (text: string) => void;
  /** Show the result to the user without touching the composer. */
  reply: (text: string) => void;
};

export type CommandDefinition = {
  id: string;
  name: string;
  description?: string;
  usage?: string;
  execute: (ctx: CommandContext) => void | Promise<void>;
};

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export type ModalOptions = {
  title: string;
  content: string | HTMLElement;
  actions?: Array<{
    label: string;
    onClick: () => void | Promise<void>;
    variant?: 'primary' | 'secondary' | 'destructive';
  }>;
  onClose?: () => void;
};

export type ModalAPI = {
  close: () => void;
  setContent: (content: string | HTMLElement) => void;
  setTitle: (title: string) => void;
  addAction: (action: NonNullable<ModalOptions['actions']>[0]) => void;
};

export type AddonSettingDefinition = {
  key: string;
  label: string;
  description?: string;
  type: 'toggle' | 'text' | 'number' | 'select';
  defaultValue: boolean | string | number;
  options?: Array<{ label: string; value: string | number }>;
};

export type UIElementOptions = {
  tag: string;
  className?: string;
  id?: string;
  text?: string;
  html?: string;
  children?: Array<HTMLElement>;
  onClick?: () => void;
  attrs?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Addon context — what start() receives
// ---------------------------------------------------------------------------

/**
 * Everything registered through the context (hooks, patches, listeners,
 * styles, commands, keybinds) is tracked and torn down automatically when the
 * addon is disabled. No reload needed.
 */
export type AddonContext = {
  readonly id: string;

  log: (...args: Array<unknown>) => void;
  warn: (...args: Array<unknown>) => void;
  error: (...args: Array<unknown>) => void;

  /** Typed event hooks. Auto-disposed. */
  hooks: {
    on: <Name extends HookName>(name: Name, fn: HookFn<Name>) => Disposer;
  };

  /** Monkey-patcher scoped to this addon. Auto-unpatched. */
  patcher: Patcher;

  /** The real Redux store. dispatch() dispatches for real. */
  redux: {
    getState: () => StateType;
    dispatch: Store<StateType>['dispatch'];
    subscribe: (listener: () => void) => Disposer;
    /** Fire cb whenever selector(state) changes (strict !==). */
    observe: <T>(
      selector: (state: StateType) => T,
      cb: (value: T, prev: T) => void
    ) => Disposer;
  };

  /** Intercept/cancel/rewrite Redux actions before reducers see them. */
  actions: {
    /** type '*' matches everything. Auto-disposed. */
    intercept: (type: string, interceptor: ActionInterceptor) => Disposer;
  };

  /** Filter or transform messages before render. Return null to hide. */
  messages: {
    intercept: (interceptor: MessageInterceptor) => Disposer;
  };

  /** Suppress notifications by type or content. */
  notifications: {
    intercept: (interceptor: NotificationInterceptor) => Disposer;
  };

  /**
   * Raw application internals. Deliberately unfenced — this is the
   * "lower level" escape hatch. No stability guarantee across rebases.
   */
  signal: {
    conversationController: typeof window.ConversationController;
    messageCache: typeof window.MessageCache;
    reduxActions: typeof window.reduxActions;
    i18n: (key: string) => string;
  };

  /** DOM helpers. Listeners registered via on() are auto-disposed. */
  dom: {
    query: (selector: string) => Element | null;
    queryAll: (selector: string) => Array<Element>;
    on: <K extends keyof DocumentEventMap>(
      target: EventTarget,
      type: K | string,
      fn: (ev: Event) => void,
      options?: AddEventListenerOptions
    ) => Disposer;
  };

  /** Inject a stylesheet; removed on disable (and by the disposer). */
  css: {
    inject: (cssText: string) => Disposer;
  };

  /** Keyboard shortcuts, e.g. 'ctrl+shift+f'. Auto-disposed. */
  keybinds: {
    register: (combo: string, fn: (ev: KeyboardEvent) => void) => Disposer;
  };

  ui: {
    createModal: (options: ModalOptions) => ModalAPI;
    createElement: (options: UIElementOptions) => HTMLElement;
    showNotification: (
      text: string,
      type?: 'info' | 'warning' | 'error' | 'success'
    ) => void;
  };

  /** Slash commands. Auto-unregistered on disable. */
  commands: {
    register: (command: CommandDefinition) => Disposer;
    list: () => Array<CommandDefinition>;
    execute: (commandId: string, argsRaw?: string) => Promise<void>;
  };

  /** Per-addon persistent storage (localStorage-backed). */
  storage: {
    get: <T = unknown>(key: string) => T | undefined;
    set: (key: string, value: unknown) => void;
    delete: (key: string) => void;
    keys: () => Array<string>;
  };

  /** Addon settings appear in Preferences under addon name. */
  settings: {
    register: (defs: Array<AddonSettingDefinition>) => Disposer;
    get: <T = unknown>(key: string) => T | undefined;
    set: (key: string, value: unknown) => void;
  };

  /** Plain fetch. Requests leave the machine — respect the user's proxy. */
  net: {
    fetch: typeof fetch;
  };

  /** Register custom teardown; runs on disable. */
  onDispose: (fn: () => void) => void;
};

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export type AddonManifest = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  authors?: Array<string>;
  /** Enabled state for a fresh profile. Keep false unless you mean it. */
  defaultEnabled?: boolean;
  /** Called when the addon is enabled (at startup or live from settings). */
  start: (ctx: AddonContext) => void | Promise<void>;
  /**
   * Optional extra teardown. Context registrations are disposed
   * automatically after this runs.
   */
  stop?: (ctx: AddonContext) => void | Promise<void>;
};
