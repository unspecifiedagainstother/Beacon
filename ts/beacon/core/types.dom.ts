// Copyright 2026 Beacon
// SPDX-License-Identifier: AGPL-3.0-only

import type { Store } from 'redux';
import type { StateType } from '../../state/reducer.preload.ts';
import type {
  MessageAttributesType,
  ReadonlyMessageAttributesType,
} from '../../model-types.d.ts';
import type {
  AttachmentDraftType,
  AttachmentForUIType,
  InMemoryAttachmentDraftType,
} from '../../types/Attachment.std.ts';

export type HookPayloads = {
  onAppStart: [];
  onActionDispatched: [action: { type: string; payload?: unknown }];
  onStateChanged: [info: { action: { type: string }; state: StateType }];
  onMessageReceived: [
    message: ReadonlyMessageAttributesType,
    info: { conversationId: string; isNewMessage: boolean },
  ];
  onMessageSent: [
    message: ReadonlyMessageAttributesType,
    info: { conversationId: string; isNewMessage: boolean },
  ];
  onMessageChanged: [
    message: ReadonlyMessageAttributesType,
    info: {
      id: string;
      conversationId: string;
      previous: ReadonlyMessageAttributesType | undefined;
    },
  ];
  onMessageEdited: [
    message: ReadonlyMessageAttributesType,
    info: {
      conversationId: string;
      previous: ReadonlyMessageAttributesType | undefined;
    },
  ];
  onMessageDeletedForEveryone: [
    message: ReadonlyMessageAttributesType,
    info: {
      conversationId: string;
      previous: ReadonlyMessageAttributesType | undefined;
    },
  ];
  onMessageDeleted: [info: { id: string; conversationId: string }];
  onConversationSelected: [conversationId: string | undefined];
  onThemeChanged: [theme: string];
};

export type HookName = keyof HookPayloads;

export type HookFn<Name extends HookName = HookName> = (
  ...args: HookPayloads[Name]
) => void | Promise<void>;

export type Disposer = () => void;

export type FilterPayloads = {
  'attachment.keepFileName': [
    value: boolean,
    context: { clientUuid?: string; fileName?: string },
  ];
  'composer.attachmentAction': [
    value: boolean,
    context: {
      attachment: AttachmentForUIType | AttachmentDraftType;
      action: 'click' | 'contextmenu';
    },
  ];
  'message.deleteForEveryone': [
    value: Partial<MessageAttributesType>,
    context: {
      message: ReadonlyMessageAttributesType;
      isAdminDelete: boolean;
    },
  ];
  'conversation.menuItems': [
    value: ReadonlyArray<ConversationMenuItem>,
    context: { conversationId: string; isGroup: boolean },
  ];
  'message.menuItems': [
    value: ReadonlyArray<ConversationMenuItem>,
    context: { messageId: string; conversationId: string },
  ];
  'notification.content': [
    value: {
      title: string;
      body: string;
      iconUrl: string | null;
      iconAbsolutePath: string | null;
    },
    context: { conversationId: string; type: string },
  ];
  'attachment.autoDownload': [
    value: boolean,
    context: {
      conversationId: string;
      sourceServiceId: string | undefined;
      disposition: 'photos' | 'videos' | 'audio' | 'documents';
      size: number;
    },
  ];
  'link.open': [
    value: string | null,
    context: { source: 'app' | 'message'; text?: string },
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

export type AsyncFilterPayloads = {
  'attachment.outgoing': [
    value: InMemoryAttachmentDraftType | null,
    context: { originalName: string; contentType: string },
  ];
  'send.verify': [
    value: boolean,
    context: {
      conversationIds: ReadonlyArray<string>;
      serviceIds: ReadonlyArray<string>;
      source: string;
    },
  ];
};

export type AsyncFilterName = keyof AsyncFilterPayloads;

export type AsyncFilterFn<Name extends AsyncFilterName = AsyncFilterName> = (
  value: AsyncFilterPayloads[Name][0],
  context: AsyncFilterPayloads[Name][1]
) =>
  | AsyncFilterPayloads[Name][0]
  | undefined
  | Promise<AsyncFilterPayloads[Name][0] | undefined>;

export type ConversationMenuItem = Readonly<{
  id: string;
  label: string;
  symbol?: string;
  onSelect: () => void;
}>;

export type FilterFn<Name extends FilterName = FilterName> = (
  value: FilterPayloads[Name][0],
  context: FilterPayloads[Name][1]
) => FilterPayloads[Name][0] | undefined;

export type SlotProps = {
  'conversation.header.beforeCall': { conversationId: string };
  'conversation.belowPinned': { conversationId: string };
};

export type SlotName = keyof SlotProps;

export type SlotRenderer<Name extends SlotName = SlotName> = (
  container: HTMLElement,
  props: SlotProps[Name]
) => void | (() => void);

export type ActionInterceptor = (action: {
  type: string;
  payload?: unknown;
}) => { type: string; payload?: unknown } | null | undefined;

export type NotificationInterceptor = (
  info: FilterPayloads['notification.show'][1]
) => boolean;

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
  before: (obj: object, method: string, cb: PatchCallbackBefore) => Disposer;
  after: (obj: object, method: string, cb: PatchCallbackAfter) => Disposer;
  instead: (obj: object, method: string, cb: PatchCallbackInstead) => Disposer;
  unpatchAll: () => void;
};

export type CommandContext = {
  args: Array<string>;
  argsRaw: string;
  conversationId: string | undefined;
  insertText: (text: string) => void;
  reply: (text: string, type?: ToastType) => void;
};

export type CommandDefinition = {
  id: string;
  name: string;
  description?: string;
  usage?: string;
  addonId?: string;
  execute: (ctx: CommandContext) => void | Promise<void>;
};

export type ToastType = 'info' | 'warning' | 'error' | 'success';

export type ModalOptions = {
  title: string;
  content: string | HTMLElement;
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

type SettingBase = {
  key: string;
  label: string;
  description?: string;
  symbol?: string;
};

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

export type AddonContext = {
  readonly id: string;

  log: (...args: Array<unknown>) => void;
  warn: (...args: Array<unknown>) => void;
  error: (...args: Array<unknown>) => void;

  hooks: {
    on: <Name extends HookName>(name: Name, fn: HookFn<Name>) => Disposer;
  };

  filters: {
    add: <Name extends FilterName>(name: Name, fn: FilterFn<Name>) => Disposer;
    addAsync: <Name extends AsyncFilterName>(
      name: Name,
      fn: AsyncFilterFn<Name>
    ) => Disposer;
  };

  patcher: Patcher;

  redux: {
    getState: () => StateType;
    dispatch: Store<StateType>['dispatch'];
    subscribe: (listener: () => void) => Disposer;
    observe: <T>(
      selector: (state: StateType) => T,
      cb: (value: T, prev: T) => void
    ) => Disposer;
  };

  actions: {
    intercept: (type: string, interceptor: ActionInterceptor) => Disposer;
  };

  notifications: {
    intercept: (interceptor: NotificationInterceptor) => Disposer;
  };

  signal: {
    conversationController: typeof window.ConversationController;
    messageCache: typeof window.MessageCache;
    reduxActions: typeof window.reduxActions;
    i18n: (key: string) => string;
  };

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

  css: {
    inject: (cssText: string) => Disposer;
    bodyClass: (className: string) => Disposer;
  };

  keybinds: {
    register: (combo: string, fn: (ev: KeyboardEvent) => void) => Disposer;
  };

  ui: {
    slot: <Name extends SlotName>(
      name: Name,
      render: SlotRenderer<Name>
    ) => Disposer;
    createModal: (options: ModalOptions) => ModalAPI;
    createElement: (options: UIElementOptions) => HTMLElement;
    showNotification: (text: string, type?: ToastType) => void;
  };

  commands: {
    register: (command: Omit<CommandDefinition, 'addonId'>) => Disposer;
    list: () => Array<CommandDefinition>;
    execute: (commandId: string, argsRaw?: string) => Promise<void>;
  };

  storage: {
    get: <T = unknown>(key: string) => T | undefined;
    set: (key: string, value: unknown) => void;
    delete: (key: string) => void;
    keys: () => Array<string>;
  };

  settings: {
    get: <T extends AddonSettingValue = AddonSettingValue>(key: string) => T;
    set: (key: string, value: AddonSettingValue) => void;
    onChange: (fn: (key: string, value: AddonSettingValue) => void) => Disposer;
  };

  net: {
    fetch: typeof fetch;
  };

  onDispose: (fn: () => void) => void;
};

export type AddonInfo = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  authors: Array<string>;
  tags: Array<string>;
  icon?: string;
  builtin: boolean;
  category?: 'privacy';
  enabled: boolean;
  error?: string;
  settings: Array<AddonSettingDefinition>;
  commands: Array<{ id: string; usage?: string; description?: string }>;
  keybinds: Array<string>;
};

export type AddonManifest = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  authors?: Array<string>;
  tags?: Array<string>;
  icon?: string;
  defaultEnabled?: boolean;
  builtin?: boolean;
  category?: 'privacy';
  settings?: Array<AddonSettingDefinition>;
  start: (ctx: AddonContext) => void | Promise<void>;
  stop?: (ctx: AddonContext) => void | Promise<void>;
};
