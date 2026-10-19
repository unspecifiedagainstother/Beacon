# Beacon Addons

Addons are TypeScript modules bundled with the app — no string eval, no
remote code. Each exports an `AddonManifest`. The platform gives them typed
event hooks, value filters at fixed points in upstream code, the real Redux
store, action interception, a runtime function patcher, slash commands,
keybinds, scoped CSS, declarative settings, and per-addon storage.

Everything an addon registers is tracked and torn down when it is disabled.
Enable/disable is live — no app reload.

## Architecture

```
ts/beacon/core/
  types.dom.ts           every public type (start here)
  hook-bus.std.ts        typed event bus (fire-and-forget)
  filters.std.ts         typed value filters (synchronous, upstream call sites)
  patcher.std.ts         before/after/instead function patching
  settings.std.ts        declarative addon settings store
  message-snapshot.std.ts  what the message logger retains on delete
  middleware.preload.ts  Redux middleware: interception + derived hooks
  context.preload.ts     builds the AddonContext, tracks disposables
  commands.dom.ts        slash-command registry
  ui.dom.ts              modal / toast / element helpers (no innerHTML)
  loader.preload.ts      enable/disable lifecycle, observable for the UI
  runtime.preload.ts     entry point; exposes window.Beacon
ts/beacon/addons/        builtin addons (*.addon.{std,dom,preload}.ts)
ts/beacon/util/          pure helpers shared by addons (unit tested)
```

### Upstream touchpoints

Every edit to an upstream file is one of these, each marked `// Beacon:`:

| File                                                                                  | What                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------- |
| `ts/state/createStore.preload.ts`                                                     | installs `beaconMiddleware`                 |
| `ts/state/initializeRedux.preload.ts`                                                 | calls `initializeBeaconRuntime(store)`      |
| `ts/util/deleteForEveryone.preload.ts`                                                | `message.deleteForEveryone` filter          |
| `ts/services/notifications.preload.ts`                                                | `notification.show` filter                  |
| `ts/model-types.d.ts`, `ts/types/Message.std.ts`                                      | `beaconDeleted` attribute + erase policy    |
| `ts/state/selectors/message.preload.ts`, `ts/components/conversation/Message.dom.tsx` | render retained deleted content             |
| `ts/components/CompositionInput.dom.tsx`                                              | slash-command completion, Enter/Tab routing |

New capability that needs a hook inside upstream code should become a new
**filter** — one `applyBeaconFilter()` call at the upstream site, typed in
`FilterPayloads` — rather than an ad-hoc import of addon code.

## Writing an addon

```ts
// ts/beacon/addons/my-addon.addon.std.ts
//   .dom.ts if it touches `document` directly,
//   .preload.ts if it imports app internals (models, jobs, sql).
import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';

export default {
  id: 'my-addon',
  name: 'My Addon',
  version: '1.0.0',
  description: 'Does a thing',
  authors: ['you'],
  tags: ['utility'],
  // Optional. Raw <svg> markup, or built from path data:
  icon: defineIcon(['M4 12h16', 'M12 4v16']),
  settings: [
    { key: 'loud', type: 'toggle', label: 'Shout', defaultValue: false },
  ],
  start(ctx) {
    ctx.hooks.on('onMessageReceived', (message, info) => {
      ctx.log(info.conversationId, message.body);
    });

    ctx.commands.register({
      id: 'shout',
      name: 'Shout',
      usage: '<text>',
      description: 'Insert text uppercased',
      execute: cmd =>
        cmd.insertText(
          ctx.settings.get<boolean>('loud')
            ? cmd.argsRaw.toUpperCase()
            : cmd.argsRaw
        ),
    });

    ctx.keybinds.register('mod+alt+x', () => ctx.ui.showNotification('hi'));
  },
} satisfies AddonManifest;
```

Import it in `core/loader.preload.ts` and add it to `BUILTIN_MANIFESTS`, run
`pnpm run beacon:build`, restart the app. It appears in Settings → Beacon →
Modules with a switch, its settings, and its live commands and shortcuts.

## The context, per capability

### Hooks — `ctx.hooks.on(name, fn)`

Fire-and-forget; return values are ignored. Payloads are typed (see
`HookPayloads` in `types.dom.ts`):

| Hook                                                               | Fires when                                        |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| `onAppStart`                                                       | all addons loaded, store live                     |
| `onActionDispatched(action)`                                       | every Redux action, pre-reducer                   |
| `onStateChanged({action, state})`                                  | every Redux action, post-reducer                  |
| `onMessageReceived(message, info)`                                 | new incoming message added                        |
| `onMessageSent(message, info)`                                     | new outgoing message added                        |
| `onMessageChanged(message, {id, conversationId, previous})`        | any attribute change                              |
| `onMessageEdited(message, {conversationId, previous})`             | a new revision arrived                            |
| `onMessageDeletedForEveryone(message, {conversationId, previous})` | remote or local delete-for-everyone               |
| `onMessageDeleted({id, conversationId})`                           | removed from the timeline (delete for me, expiry) |
| `onConversationSelected(id \| undefined)`                          | conversation opened/closed                        |
| `onThemeChanged(theme)`                                            | light/dark flip                                   |

`previous` is the message as Redux held it before the change, when it was
loaded — enough to diff edits without keeping your own copy.

### Filters — `ctx.filters.add(name, fn)`

Synchronous value transforms at fixed upstream call sites. `fn(value,
context)` returns the new value; `undefined` keeps it. A throwing filter is
logged and skipped.

| Filter                      | Value                                     | Where                          |
| --------------------------- | ----------------------------------------- | ------------------------------ |
| `message.deleteForEveryone` | attributes merged into the erased message | `deleteForEveryone.preload.ts` |
| `notification.show`         | `boolean` — return `false` to suppress    | `NotificationService.add`      |

`ctx.notifications.intercept(info => boolean)` is sugar over
`notification.show` (return `true` to block).

### Icon — `manifest.icon`

SVG markup shown on the addon's card. Any square `<svg>` works (24×24 by
convention) — paste one from an icon set, write it inline, or build it:

```ts
import { defineIcon } from '../core/icons.std.ts';

icon: defineIcon('M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14'),            // outline
icon: defineIcon(['M12 2a10 10 0 1 0 0 20...'], { stroke: false }), // solid
icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>',
```

It is drawn as a CSS mask, so only the shape matters: it takes the theme
color, and the accent color while enabled. Masks load SVG in image mode, so
scripts or external references inside the markup never run. Without an icon
(or with markup that is not an `<svg>`), the card shows the name's first
letter. Builtin icons live in `addons/icons.std.ts`.

### Settings — `manifest.settings` + `ctx.settings`

Declare settings on the manifest (`toggle`, `text` (optionally
`multiline`), `number` (`min`/`max`), `select` (`options`)). The Modules
page renders them whether or not the addon is running. Read them with
`ctx.settings.get(key)` (always returns a valid value — stored or default,
coerced to the declared type) and react with `ctx.settings.onChange(fn)`.

Settings live in localStorage: configuration only, never content.

### Redux — `ctx.redux`

The real store. `getState()`, `dispatch()` (dispatches for real),
`subscribe()`, and `observe(selector, cb)` which fires only when the selected
value changes. Upstream selectors (`ts/state/selectors/`) are importable.

### Action interception — `ctx.actions.intercept(type, fn)`

Runs in the middleware before reducers. Return the action to pass it through,
a replacement to rewrite it, `undefined` to leave it, or `null` to cancel it.
`'*'` matches every action.

Cancelling an action only changes what Redux sees — the database and models
already did their work. Cancelling `MESSAGE_DELETED`, for example, leaves a
message on screen that is gone from the DB and vanishes on restart. Use a
filter or a patch on the code that does the work instead.

### Patcher — `ctx.patcher`

Vencord-style monkey patching of any live object:

```ts
ctx.patcher.before(obj, 'method', args => {
  /* return new args */
});
ctx.patcher.after(obj, 'method', (result, args) => {
  /* return new result */
});
ctx.patcher.instead(obj, 'method', (args, original) => original(...args));
```

Patch prototypes to affect every instance (`ConversationModel.prototype`).
Patches from multiple addons on one method stack; each disposer removes only
its own layer. `before`/`after` callbacks are guarded so a broken addon can't
break the patched method; `instead` owns the call and is not.

### Raw internals — `ctx.signal`

`conversationController`, `messageCache`, `reduxActions`, `i18n`. Deliberately
unfenced. No stability guarantee across upstream rebases.

### Commands — `ctx.commands.register(def)`

`execute(cmd)` receives `args`, `argsRaw`, `conversationId`,
`insertText(text)` (into the composer at the cursor), and `reply(text, type)`
(a toast). In the composer, `/` at the start of a line opens ranked
suggestions (exact id first); Tab completes, Enter runs. A command typed in
full runs on Enter even before the popup appears, so it is never sent to the
contact as text. Text that is not a registered command (`/r/funny`), and
any line starting with `//`, is sent normally.

Builtins: `/help`, `/addons`, `/enable <id>`, `/disable <id>`,
`/reload <id>`, `/shrug`.

### The rest

- `ctx.dom` — `query`, `queryAll`, `on(target, event, fn)` (auto-removed)
- `ctx.css.inject(css)`, `ctx.css.bodyClass(name)` — removed on disable.
  Prefer a body class plus rules in `stylesheets/_beacon-theme.scss` over
  injected CSS for anything non-trivial.
- `ctx.keybinds.register('mod+alt+f', fn)` — `mod` = Ctrl (⌘ on mac). Use
  the `mod+alt+<key>` family: Signal itself owns most `mod+shift+<letter>`
  combos (search, reply, mute...), and desktops grab `ctrl+alt+l`/`t`;
  matches on `key` or `code`, ignores auto-repeat
- `ctx.ui` — `createModal({title, content, size, actions})` (Escape and
  overlay close; closed automatically on disable), `createElement`,
  `showNotification(text, type)` (stacked toasts)
- `ctx.storage` — per-addon KV in localStorage. **Not encrypted at rest** —
  for message-derived data use the message attributes or items storage, as
  the message logger does.
- `ctx.net.fetch` — plain fetch; requests leave the machine
- `ctx.onDispose(fn)` — custom teardown

## Console access

```js
Beacon.loader.list();
await Beacon.loader.enable('stats-dashboard');
Beacon.settings.set('message-logger', 'style', 'strike');
Beacon.hooks.on('onMessageEdited', m => console.log(m.editHistory));
Beacon.filters.add('notification.show', () => false); // mute everything
Beacon.commands.execute('stats');
Beacon.openModules();
```

`Beacon.loader.register(manifest)` registers a console-built manifest; then
`enable()` it — useful for prototyping before writing a file.

## Ground rules

- A throwing hook, filter, interceptor, patch callback, or command never
  breaks the app or other addons — every dispatch path is guarded.
- Addons run in the renderer with full privileges. There is no sandbox and no
  permission model: only ship code you trust.
- `start()` must register everything through `ctx` so disable actually
  cleans up. Side effects outside the context are leaks.
- Never build UI with `innerHTML` from message data. The ui helpers don't
  offer it on purpose.
- Keep ids kebab-case and stable — they key enable state and settings.
