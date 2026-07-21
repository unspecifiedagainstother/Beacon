# Beacon Addons

Addons are TypeScript modules bundled with the app — no string eval, no
remote code. Each exports an `AddonManifest`. The platform gives them typed
event hooks, the real Redux store, action interception, a runtime function
patcher, slash commands, keybinds, scoped CSS, and per-addon storage.

Everything an addon registers is tracked and torn down when it is disabled.
Enable/disable is live — no app reload.

## Architecture

```
ts/beacon/core/
  types.dom.ts        every public type (start here)
  hook-bus.std.ts     typed event bus
  patcher.std.ts      before/after/instead function patching
  middleware.preload.ts  Redux middleware: interception + derived hooks
  context.preload.ts  builds the AddonContext, tracks disposables
  commands.dom.ts     slash-command registry
  ui.dom.ts           modal / notification / element helpers
  loader.preload.ts   enable/disable lifecycle, config persistence
  runtime.preload.ts  entry point; exposes window.Beacon
ts/beacon/addons/     builtin addons (*.addon.std.ts / *.addon.dom.ts)
```

Wiring into upstream is two lines: `beaconMiddleware` in
`ts/state/createStore.preload.ts` and `initializeBeaconRuntime(store)` in
`ts/state/initializeRedux.preload.ts`. Everything else lives in `ts/beacon/`,
so upstream rebases stay cheap.

## Writing an addon

```ts
// ts/beacon/addons/my-addon.addon.std.ts (.dom.ts if it touches document)
import type { AddonManifest } from '../core/types.dom.ts';

export default {
  id: 'my-addon',
  name: 'My Addon',
  version: '1.0.0',
  description: 'Does a thing',
  start(ctx) {
    // Typed event hooks — real payloads from the Redux pipeline.
    ctx.hooks.on('onMessageReceived', (message, info) => {
      ctx.log(info.conversationId, message.body);
    });

    // Slash command with args. /shout hello there
    ctx.commands.register({
      id: 'shout',
      name: 'Shout',
      usage: '<text>',
      description: 'Insert text uppercased',
      execute: cmd => cmd.insertText(cmd.argsRaw.toUpperCase()),
    });

    // Keybind, scoped CSS — all auto-disposed on disable.
    ctx.keybinds.register('mod+shift+x', () => ctx.ui.showNotification('hi'));
    ctx.css.inject('.some-class { display: none; }');
  },
} satisfies AddonManifest;
```

Register it in `loadBuiltinManifests()` in `core/loader.preload.ts`, run
`pnpm run beacon:build`, restart the app.

## The context, per capability

### Hooks — `ctx.hooks.on(name, fn)`

Payloads are typed (see `HookPayloads` in `types.dom.ts`):

| Hook | Fires when |
| --- | --- |
| `onAppStart` | all addons loaded, store live |
| `onActionDispatched(action)` | every Redux action, pre-reducer |
| `onStateChanged({action, state})` | every Redux action, post-reducer |
| `onMessageReceived(message, info)` | incoming message added |
| `onMessageSent(message, info)` | outgoing message added |
| `onMessageChanged(message, info)` | edit / status / reaction change |
| `onMessageDeleted({id, conversationId})` | message removed |
| `onConversationSelected(id \| undefined)` | conversation opened/closed |
| `onThemeChanged(theme)` | light/dark flip |

Message payloads are the app's own `ReadonlyMessageAttributesType` — the full
attributes, not a summary.

### Redux — `ctx.redux`

The real store. `getState()`, `dispatch()` (dispatches for real),
`subscribe()`, and `observe(selector, cb)` which fires only when the selected
value changes. Upstream selectors (`ts/state/selectors/`) are importable and
the natural way to read state.

### Action interception — `ctx.actions.intercept(type, fn)`

Runs in the middleware before reducers. Return the action to pass it through,
a replacement to rewrite it, or `null` to cancel it. `'*'` matches every
action. This is the lowest-level control point in the renderer.

```ts
ctx.actions.intercept('conversations/TARGETED_CONVERSATION_CHANGED', a => {
  ctx.log('opening', a.payload);
  return a; // or null to block, or a modified action
});
```

### Patcher — `ctx.patcher`

Vencord-style monkey patching of any live object:

```ts
ctx.patcher.before(obj, 'method', args => { /* rewrite args */ });
ctx.patcher.after(obj, 'method', (result, args) => { /* rewrite result */ });
ctx.patcher.instead(obj, 'method', (args, original) => original(...args));
```

Patches from multiple addons on the same method stack; each disposer removes
only its own layer. Disabling the addon unpatches everything.

### Raw internals — `ctx.signal`

`conversationController`, `messageCache`, `reduxActions`, `i18n`. Deliberately
unfenced. No stability guarantee across upstream rebases — if you use these,
you own the breakage.

### Commands — `ctx.commands.register(def)`

`execute(cmd)` receives a `CommandContext`: `args` (split), `argsRaw`,
`conversationId`, `insertText(text)` (into the composer at the cursor), and
`reply(text)` (notification, composer untouched). Typing `/` at the start of
a line in the composer opens the autocomplete; everything after the command
word is passed as arguments. Builtins: `/help`, `/addons`, `/enable <id>`,
`/disable <id>`.

### The rest

- `ctx.dom` — `query`, `queryAll`, `on(target, event, fn)` (auto-removed)
- `ctx.css.inject(css)` — returns a disposer; also removed on disable
- `ctx.keybinds.register('mod+shift+f', fn)` — `mod` = Ctrl (⌘ on mac)
- `ctx.ui` — `createModal`, `createElement`, `showNotification`
- `ctx.storage` — per-addon persistent KV (localStorage-backed)
- `ctx.net.fetch` — plain fetch; requests leave the machine, respect the
  user's proxy expectations
- `ctx.onDispose(fn)` — custom teardown

## Console access

`window.Beacon` exposes `hooks`, `loader`, `commands`, `store`, and
`createPatcher` for experiments:

```js
Beacon.loader.list()
await Beacon.loader.enable('stats-dashboard')
Beacon.hooks.on('onMessageReceived', m => console.log(m.body))
Beacon.commands.execute('stats')
```

`Beacon.loader.register(manifest)` lets you register a manifest built in the
console, then `enable()` it — useful for prototyping before writing a file.

## Ground rules

- A throwing hook, interceptor, or command never breaks the app or other
  addons — every dispatch path is guarded.
- Addons run in the renderer with full renderer privileges. There is no
  sandbox and no permission model: only ship code you trust.
- `start()` must register everything through `ctx` so disable actually
  cleans up. Side effects outside the context (globals, timers you don't
  clear in `onDispose`) are leaks.
- Storage keys and CSS are namespaced per addon id; keep ids kebab-case and
  stable — they key the enable/disable config.
