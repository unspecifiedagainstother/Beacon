> [!WARNING]
> This is not a finished project, things may be broken. If you find any bugs please post them in [/issues](https://github.com/unspecifiedagainstother/Beacon/issues)

---

# Beacon

A Signal fork for privacy freaks.

Beacon is Signal Desktop with the privacy, security and quality-of-life features Signal doesn't ship. It talks to the official Signal servers, so you keep chatting with everyone on Signal, and it stays close to upstream so updates are easy to merge.

- [Features](#features)
  - [Multiple accounts](#multiple-accounts)
  - [Register without a phone](#register-on-desktop-without-a-phone)
  - [Privacy](#privacy)
  - [Security](#security)
  - [Messaging](#messaging)
  - [Interface](#interface)
  - [Hidden Signal features](#hidden-signal-features)
  - [Network](#network)
- [Plugins](#plugins)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Slash commands](#slash-commands)
- [Building and running](#building-and-running)

## Features

### Multiple accounts

Use several Signal accounts side by side.
- Click an account to switch to it instantly. It opens in the same place and size as the window you were in.
- Right-click an account to remove it and delete its data from this computer.
- One tray icon for everything; its badge counts unread messages across all accounts. Quitting from any window quits them all.

Each account runs in its own process with its own data folder (`<data folder>-accounts/<id>`), so accounts never share a database.

### Register on desktop without a phone

Signal Desktop normally only works as a linked device. Beacon can also be the main device for an account.

- The start screen has **Link a phone** and **New account**.
- **New account** registers a phone number directly on the desktop: verify by SMS or voice call, set a PIN and a profile.
- The captcha opens in a small Beacon window. If Signal rejects it, choose **Solve it in your browser instead**, solve it in your normal browser, then paste the **Open Signal** link back in (the [signal-cli](https://github.com/AsamK/signal-cli/wiki/Registration-with-captcha) method).

### Privacy

Everything here is in **Settings > Beacon Privacy**, with an overview of which protections are on.

| Feature | What it does |
| --- | --- |
| Window & system | Hide the window from screenshots and screen recording, keep the unread count out of the title, tray and taskbar, stop spellcheck dictionary downloads. |
| Chat list | Blur message previews in the chat list until you hover them. |
| Notifications | Per chat and for groups: show the name only, nothing, or no notification at all, and never show profile photos in notifications. |
| Attachments | Strip metadata (EXIF, GPS, camera info) from files you send, give them random names, and control what downloads automatically. |
| Links | See where a link really goes before your browser opens it, and drop tracking parameters. |
| Unverified contacts | Ask before messaging or calling someone whose safety number you haven't verified. |
| Sealed sender | Mark messages that arrived without sealed sender, meaning Signal's server could see who sent them. |
| Screen sharing | Warn you and hide your chats while you share your screen in a Signal call. |
| Exports | Everything Beacon exports (message log, profile history) is encrypted with a password you choose. |
| Network monitor | A live list of every server Beacon connects to, kept in memory only. |

### Security
- **App lock.** Ask for a passphrase when Beacon opens, after inactivity, and when the computer locks or sleeps. Mod+Alt+L locks right away.
- **Duress passphrase.** A second passphrase for when you're forced to unlock Beacon. It opens the app normally but either keeps hidden and locked chats out of sight, or erases all Beacon data.
- **Hidden and locked chats.** Hide a chat from the list and search, or lock it behind your passphrase, from the chat's ⋯ menu. Mod+Alt+J shows hidden chats.
- **Database passphrase.** Signal keeps its database key in your system keychain, so anyone using your computer account can open it. Beacon can instead encrypt that key with your passphrase (scrypt + AES-256-GCM) and ask for it at startup. There is no recovery if you forget it.
- **Crash safety.** A broken settings page or panel shows an error box instead of taking the app down.

### Messaging
- **Inline markdown.** Type `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` or `||spoiler||` and it turns into Signal formatting as you type. Ctrl+Z undoes it.
- **Multi-file upload.** Attach as many files as you like; they're sent one after another.
- **Replies to anything.** Reply to stickers, GIFs and other media.
- **Message logger.** Deleted messages stay readable and edits are logged, stored in the encrypted database. Mod+Alt+G opens the log.
- **Edit history.** "Show changes" highlights exactly which words changed between versions.
- **Bookmarks.** Right-click a message to bookmark it or save a copy to Note to Self. Mod+Alt+K lists bookmarks.
- **File details.** Right-click a message with a file for its name, type, size, dimensions, duration, upload time, hashes and location on disk. Audio messages show their file name in the chat.
- **Better search.** Filter search with `from:name`, `before:2026-01-31`, `after:2026-01-01` and `has:link|file|image|video|audio|media`.
- **Profile history.** Records contacts' profile changes (names, usernames, about, avatars, numbers). Mod+Alt+P or `/profilelog`.
- **Call Peek.** See who is in a group call before joining, without them being notified.
- **Exact timestamps.** Real times instead of "5m", dates on older messages and the full date on hover.
- **Character counter** while you type, including when a message gets long enough to be sent as a file.
- **Voice messages.** More playback speeds and a default speed.
- **Purge messages.** Delete all of your own messages in a chat for everyone at once.
- **Read all.** Mark every chat as read with Mod+Alt+R or `/readall`.

### Interface
- **Flat, darker theme** with squarer, consistent corners everywhere.
- **Sticker picker** in a Discord-style layout next to the message box; remove any sticker pack, including the default ones.
- **Chat list.** Pin more than 4 chats, collapse the Pinned section, and see who is typing `("Alice is typing...")`.
- **Custom CSS** editor for your own tweaks and themes.

### Hidden Signal features
Signal Desktop already contains features that aren't released to everyone yet or are only shown to Signal staff. Beacon lets you turn them on in **Settings > Beacon > Hidden Signal features**:
- Disappearing call history
- Key transparency
- Calling settings (bitrate, video quality, call server)
- Developer mode: right-click a chat to copy its conversation, account and phone-number IDs; right-click a message to copy its raw data
- Download other people's stories
- Detailed profile info: everything Beacon knows about a contact, in their profile

### Network
- **Proxy and Tor.** Send all of Signal's traffic through an HTTP, HTTPS or SOCKS proxy, or Tor with one click. Messages, attachments, contact lookup and link previews go through it. Calls don't; turn on *Always relay calls* in Signal's privacy settings to hide your IP from the other side.

## Plugins
Beacon has a plugin system. Plugins are TypeScript modules bundled with the app; there is no remote code and no `eval`. Turn them on and off live in **Settings → Beacon → Modules**, without restarting.

### Included plugins
| Plugin | What it does |
| --- | --- |
| Ghost Mode | Stop sending typing indicators and read receipts while still seeing everyone else's. |
| Privacy Screen | Blur the whole window with Mod+Alt+H, when it loses focus, or when you're idle. |
| Blur Media | Blur images, videos and previews until you hover them. Mod+Alt+B. |
| Clear URLs | Strip tracking parameters from links before you send them. |
| Notification Filter | Mute notifications by keyword or sender, or only notify on keywords. |
| Rename Files | Click a file you attached (or right-click any attachment, photos and videos too) and send it under any name you like. On by default. |
| Text Replace | Find/replace rules (plain or regex) applied to messages you send. |
| Snippets | Saved text you insert with your own slash commands. |
| Text Faces | `/tableflip`, `/unflip`, `/lenny`, `/disapprove` and more. |
| Focus Mode | Hide the sidebar and tabs with Mod+Alt+F or `/focus`. |
| Compact Mode | Denser timeline: tighter bubbles, smaller gaps and text. |
| Quick Mute | Mod+Alt+M mutes or unmutes the open chat. |
| Stats Dashboard | Session counters: messages, edits, deletes, busiest chats. |

### Writing a plugin
A plugin is a file in `ts/beacon/addons/` that exports a manifest:

```ts
import type { AddonManifest } from '../core/types.dom.ts';
import { defineIcon } from '../core/icons.std.ts';

export default {
  id: 'shout',
  name: 'Shout',
  version: '1.0.0',
  description: 'Insert text in capitals.',
  authors: ['you'],
  icon: defineIcon(['M4 12h16', 'M12 4v16']),
  settings: [
    { key: 'loud', type: 'toggle', label: 'Capitals', defaultValue: true },
  ],
  start(ctx) {
    ctx.commands.register({
      id: 'shout',
      name: 'Shout',
      usage: '<text>',
      description: 'Insert the text in capitals',
      execute: cmd =>
        cmd.insertText(
          ctx.settings.get<boolean>('loud')
            ? cmd.argsRaw.toUpperCase()
            : cmd.argsRaw
        ),
    });

    ctx.hooks.on('onMessageReceived', (message, info) => {
      ctx.log(info.conversationId, message.body);
    });

    ctx.keybinds.register('mod+alt+x', () => ctx.ui.showNotification('hi'));
  },
} satisfies AddonManifest;
```

Add it to `BUILTIN_MANIFESTS` in `ts/beacon/core/loader.preload.ts`, run `pnpm run beacon:build` and restart. It appears in Modules with a switch and its settings. Name the file `*.addon.std.ts`, `.dom.ts` if it touches `document`, or `.preload.ts` if it imports app internals.

Everything a plugin registers through `ctx` is removed when it's turned off.
| API | What it gives you |
| --- | --- |
| `ctx.hooks.on(name, fn)` | Events: `onAppStart`, `onMessageReceived`, `onMessageSent`, `onMessageChanged`, `onMessageEdited`, `onMessageDeletedForEveryone`, `onMessageDeleted`, `onConversationSelected`, `onThemeChanged`, `onActionDispatched`, `onStateChanged`. |
| `ctx.filters.add(name, fn)` | Change values at fixed points in Signal: message and chat right-click menus, notifications, opening links, attachments, sending. Return a new value or `undefined` to keep it. |
| `ctx.redux` | The real Redux store: `getState`, `dispatch`, `subscribe`, and `observe(selector, fn)`. |
| `ctx.actions.intercept(type, fn)` | See every Redux action before it applies; pass it on, rewrite it, or return `null` to cancel it. |
| `ctx.patcher` | `before`, `after` and `instead` patches on any live object, stacked safely across plugins. |
| `ctx.commands.register(def)` | Slash commands with autocomplete in the message box. |
| `ctx.keybinds.register(keys, fn)` | Keyboard shortcuts (`mod` is Ctrl, or ⌘ on macOS). |
| `ctx.settings` | Read the settings declared in the manifest (toggle, text, number, select) and react to changes. |
| `ctx.ui` | Modals, toasts, safe element creation, and named slots in Signal's UI to draw into. |
| `ctx.css` | Inject CSS or toggle a class on `<body>`. |
| `ctx.storage` | Per-plugin key/value storage (not encrypted; never store message content here). |
| `ctx.signal` | Raw access to Signal internals, with no stability guarantee. |

Plugins run with full app privileges. There is no sandbox, so only install plugins you trust.

### Console
With DevTools open (`--debug`), `window.Beacon` is available in the *Electron Isolated Context*:

```js
Beacon.loader.list();
await Beacon.loader.enable('stats-dashboard');
Beacon.settings.set('message-logger', 'style', 'strike');
Beacon.commands.execute('stats');
```

## Keyboard shortcuts
`Mod` is Ctrl on Windows and Linux and ⌘ on macOS.

| Shortcut | Action |
| --- | --- |
| Mod+Alt+L | Lock Beacon |
| Mod+Alt+J | Show hidden chats |
| Mod+Alt+K | Bookmarks |
| Mod+Alt+G | Message log |
| Mod+Alt+P | Profile history |
| Mod+Alt+R | Mark all chats as read |
| Mod+Alt+H | Privacy screen (plugin) |
| Mod+Alt+B | Blur media (plugin) |
| Mod+Alt+F | Focus mode (plugin) |
| Mod+Alt+M | Mute the open chat (plugin) |

## Slash commands
Type `/` at the start of the message box for a searchable list. Built in: `/help`, `/addons`, `/enable <id>`, `/disable <id>`, `/reload <id>`, `/readall`, `/bookmarks`, `/messagelog`, `/profilelog`, `/hidden`, `/lock`, `/purge`, `/shrug`, plus the commands of any plugins you turn on. Lines starting with `//` and text like `/r/funny` are sent as normal messages.

## Building and running
Beacon builds like Signal Desktop: Node (the version in `.nvmrc`) and pnpm.
```sh
pnpm install
pnpm run generate
pnpm start
```

On Linux, the helper scripts do the setup for you. They run inside a `mollydesk` [distrobox](https://distrobox.it/) container, install the right Node and pnpm, install dependencies on first run, and rebuild only when the sources changed:
```sh
scripts/beacon/start.sh             # your real account
scripts/beacon/start.sh --staging   # Signal's test servers, for development
scripts/beacon/start.sh --debug     # with DevTools on 127.0.0.1:9229
scripts/beacon/build.sh             # full rebuild
scripts/beacon/start.sh --help      # all options
```

The same commands are available as `pnpm run beacon:start`, `beacon:start:staging`, `beacon:start:debug` and `beacon:build`.

## License
This project is licensed under the [GNU AFFERO GENERAL PUBLIC](LICENSE) License - see the LICENSE file for details

## Acknowledgments

Inspiration, code snippets, etc.
* [Signal Desktop](https://github.com/signalapp/Signal-Desktop)
* [Molly Signal Fork](https://github.com/mollyim/mollyim-android)
* [signal-cli](https://github.com/AsamK/signal-cli), for the captcha registration method
