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
import type {
  MessageAttributesType,
  ReadonlyMessageAttributesType,
} from '../../model-types.d.ts';

// ---------------------------------------------------------------------------
// Hooks — fire-and-forget notifications
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
  /** A new incoming message was added to the timeline. */
  onMessageReceived: [
    message: ReadonlyMessageAttributesType,
    info: { conversationId: string; isNewMessage: boolean },
  ];
  /** A new outgoing message was added to the timeline. */
  onMessageSent: [
    message: ReadonlyMessageAttributesType,
    info: { conversationId: string; isNewMessage: boolean },
  ];
  /** An existing message's attributes changed (edit, status, reactions...). */
  onMessageChanged: [
    message: ReadonlyMessageAttributesType,
    info: {
      id: string;
      conversationId: string;
      /** Attributes before the change, if the message was loaded in Redux. */
      previous: ReadonlyMessageAttributesType | undefined;
    },
  ];
  /**
   * A message gained a new revision. `message.editHistory[0]` is the new
   * revision; `previous` holds what it said before.
   */
  onMessageEdited: [
    message: ReadonlyMessageAttributesType,
    info: {
      conversationId: string;
      previous: ReadonlyMessageAttributesType | undefined;
    },
  ];
  /** A message flipped to deletedForEveryone (remote or local delete). */
  onMessageDeletedForEveryone: [
    message: ReadonlyMessageAttributesType,
    info: {
      conversationId: string;
      previous: ReadonlyMessageAttributesType | undefined;
    },
  ];
  /** A message was removed from the timeline (delete for me, expiry...). */
  onMessageDeleted: [info: { id: string; conversationId: string }];
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
// Filters — synchronous, value-transforming hook points inside upstream code
// ---------------------------------------------------------------------------

/**
 * Filters are the "patch points" Beacon adds to upstream code. Each is a
 * single call site in an upstream file that passes a value through every
 * registered filter, waterfall style, and uses the result. Unlike hooks they
 * run synchronously and their return value matters.
 *
 * Shape: [value, context]. A filter receives both and returns the (possibly
 * replaced) value. Returning undefined keeps the value unchanged.
 */
export type FilterPayloads = {
  /**
   * ts/util/deleteForEveryone.preload.ts — attributes merged into a message
   * when a delete-for-everyone erases it. Add fields to retain data; the
   * message JSON lives in the encrypted SQLCipher DB.
   */
  'message.deleteForEveryone': [
    value: Partial<MessageAttributesType>,
    context: {
      message: ReadonlyMessageAttributesType;
      isAdminDelete: boolean;
    },
  ];
  /**
   * ts/services/notifications.preload.ts — whether to show a desktop
   * notification. Return false to suppress it.
   */
  /**
   * ts/components/conversation/ConversationHeader.dom.tsx — extra items for
   * the conversation header ⋯ menu, shown below the built-in ones.
   */
  'conversation.menuItems': [
    value: ReadonlyArray<ConversationMenuItem>,
    context: { conversationId: string; isGroup: boolean },
  ];
  'notification.show': [
    value: boolean,
    context: {
      conversationId: string;
      messageId: string;
      message: string;
      senderTitle: string;
      type: string;
    },
  ];
};

export type FilterName = keyof FilterPayloads;

/** An entry addons can add to a conversation's header ⋯ menu. */
export type ConversationMenuItem = Readonly<{
  id: string;
  label: string;
  /** AxoSymbol glyph name, e.g. 'trash', 'lock', 'grid'. */
  symbol?: string;
  onSelect: () => void;
}>;

export type FilterFn<Name extends FilterName = FilterName> = (
  value: FilterPayloads[Name][0],
  context: FilterPayloads[Name][1]
) => FilterPayloads[Name][0] | undefined;

// ---------------------------------------------------------------------------
// UI slots — named places in upstream UI where addons render plain DOM
// ---------------------------------------------------------------------------

export type SlotProps = {
  /** Conversation header, just left of the call buttons. */
  'conversation.header.beforeCall': { conversationId: string };
  /** Under the pinned-messages bar at the top of a conversation. */
  'conversation.belowPinned': { conversationId: string };
};

export type SlotName = keyof SlotProps;

/** Draw into `container`; return a cleanup. Re-run when props change. */
export type SlotRenderer<Name extends SlotName = SlotName> = (
  container: HTMLElement,
  props: SlotProps[Name]
) => void | (() => void);

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
}) => { type: string; payload?: unknown } | null | undefined;

/** Return true to block the notification. */
export type NotificationInterceptor = (
  info: FilterPayloads['notification.show'][1]
) => boolean;

// ---------------------------------------------------------------------------
// Patcher
// ---------------------------------------------------------------------------

export type PatchCallbackBefore = (
  args: Array<unknown>
) => Array<unknown> | void;
export type PatchCallbackAfter = (
  result: unknown,
  args: Array<unknown>
) => unknown;
export type PatchCallbackInstead = (
  args: Array<unknown>,
  original: (...a: Array<unknown>) => unknown
) => unknown;

export type Patcher = {
  /** Run cb before the original; return a new args array to rewrite them. */
  before: (obj: object, method: string, cb: PatchCallbackBefore) => Disposer;
  /** Run cb after the original; a non-undefined return replaces the result. */
  after: (obj: object, method: string, cb: PatchCallbackAfter) => Disposer;
  /** Replace the original entirely; cb receives it to call (or not). */
  instead: (obj: object, method: string, cb: PatchCallbackInstead) => Disposer;
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
  reply: (text: string, type?: ToastType) => void;
};

export type CommandDefinition = {
  id: string;
  name: string;
  description?: string;
  usage?: string;
  /** Set by the platform: the addon that registered it (undefined = core). */
  addonId?: string;
  execute: (ctx: CommandContext) => void | Promise<void>;
};

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export type ToastType = 'info' | 'warning' | 'error' | 'success';

export type ModalOptions = {
  title: string;
  content: string | HTMLElement;
  /** 'wide' for list/log viewers. */
  size?: 'normal' | 'wide';
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

export type UIElementOptions = {
  tag: string;
  className?: string;
  id?: string;
  text?: string;
  children?: Array<HTMLElement | string>;
  onClick?: (ev: MouseEvent) => void;
  attrs?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

type SettingBase = {
  key: string;
  label: string;
  description?: string;
};

/**
 * Declared on the manifest so Settings → Beacon → Modules can render the
 * controls whether or not the addon is running.
 */
export type AddonSettingDefinition =
  | (SettingBase & { type: 'toggle'; defaultValue: boolean })
  | (SettingBase & {
      type: 'text';
      defaultValue: string;
      placeholder?: string;
      multiline?: boolean;
    })
  | (SettingBase & {
      type: 'number';
      defaultValue: number;
      min?: number;
      max?: number;
    })
  | (SettingBase & {
      type: 'select';
      defaultValue: string;
      options: Array<{ label: string; value: string }>;
    });

export type AddonSettingValue = boolean | string | number;

// ---------------------------------------------------------------------------
// Addon context — what start() receives
// ---------------------------------------------------------------------------

/**
 * Everything registered through the context (hooks, filters, patches,
 * listeners, styles, commands, keybinds) is tracked and torn down
 * automatically when the addon is disabled. No reload needed.
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

  /** Value-transforming patch points in upstream code. Auto-disposed. */
  filters: {
    add: <Name extends FilterName>(name: Name, fn: FilterFn<Name>) => Disposer;
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

  /** Sugar over the 'notification.show' filter. */
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
    on: (
      target: EventTarget,
      type: string,
      fn: (ev: Event) => void,
      options?: AddEventListenerOptions
    ) => Disposer;
  };

  /** Inject a stylesheet; removed on disable (and by the disposer). */
  css: {
    inject: (cssText: string) => Disposer;
    /** Toggle a class on <body> while the addon runs. */
    bodyClass: (className: string) => Disposer;
  };

  /** Keyboard shortcuts, e.g. 'mod+alt+f'. Auto-disposed. */
  keybinds: {
    register: (combo: string, fn: (ev: KeyboardEvent) => void) => Disposer;
  };

  ui: {
    /** Render into a named slot in upstream UI. Auto-removed on disable. */
    slot: <Name extends SlotName>(
      name: Name,
      render: SlotRenderer<Name>
    ) => Disposer;
    createModal: (options: ModalOptions) => ModalAPI;
    createElement: (options: UIElementOptions) => HTMLElement;
    showNotification: (text: string, type?: ToastType) => void;
  };

  /** Slash commands. Auto-unregistered on disable. */
  commands: {
    register: (command: Omit<CommandDefinition, 'addonId'>) => Disposer;
    list: () => Array<CommandDefinition>;
    execute: (commandId: string, argsRaw?: string) => Promise<void>;
  };

  /**
   * Per-addon persistent KV (localStorage-backed, NOT encrypted at rest).
   * Never put message content or other secrets here.
   */
  storage: {
    get: <T = unknown>(key: string) => T | undefined;
    set: (key: string, value: unknown) => void;
    delete: (key: string) => void;
    keys: () => Array<string>;
  };

  /** Values for the settings declared on the manifest. */
  settings: {
    get: <T extends AddonSettingValue = AddonSettingValue>(key: string) => T;
    set: (key: string, value: AddonSettingValue) => void;
    /** Fires on any change, including edits from the Settings page. */
    onChange: (fn: (key: string, value: AddonSettingValue) => void) => Disposer;
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

/** What the loader reports about an addon (Settings page, /addons, console). */
export type AddonInfo = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  authors: Array<string>;
  tags: Array<string>;
  icon?: string;
  builtin: boolean;
  enabled: boolean;
  /** Message from the last failed start(), cleared on success. */
  error?: string;
  settings: Array<AddonSettingDefinition>;
  /** Live registrations — only populated while enabled. */
  commands: Array<{ id: string; usage?: string; description?: string }>;
  keybinds: Array<string>;
};

export type AddonManifest = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  authors?: Array<string>;
  /** Free-form labels shown as chips, e.g. 'privacy', 'chat', 'utility'. */
  tags?: Array<string>;
  /**
   * SVG markup for the Modules page, drawn as a mask in the accent color —
   * see core/icons.std.ts (defineIcon builds one from path data). Falls back
   * to the name's first letter.
   */
  icon?: string;
  /** Enabled state for a fresh profile. Keep false unless you mean it. */
  defaultEnabled?: boolean;
  /**
   * Part of Beacon itself (ts/beacon/builtin/): always running, cannot be
   * disabled, listed under Settings → Beacon → Built-in features instead of
   * Modules.
   */
  builtin?: boolean;
  /** User-facing settings, rendered in Settings → Beacon → Modules. */
  settings?: Array<AddonSettingDefinition>;
  /** Called when the addon is enabled (at startup or live from settings). */
  start: (ctx: AddonContext) => void | Promise<void>;
  /**
   * Optional extra teardown. Context registrations are disposed
   * automatically after this runs.
   */
  stop?: (ctx: AddonContext) => void | Promise<void>;
};
