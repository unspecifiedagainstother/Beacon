# Builtin addons

Bundled addon modules. All disabled by default; enable in
Settings → Beacon → Modules (live, no restart) or with `/enable <id>`.

| Id                    | What it does                                                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message-logger`      | Keeps deleted-for-everyone messages readable (red, under the "deleted" notice) and indexes edits. `mod+alt+G` or `/messagelog` opens a searchable log with jump-to-message; `/exportlog`, `/clearlog`. Content is stored on the message in the encrypted DB; attachment files are not retained. |
| `ghost-mode`          | Stops sending typing indicators and read receipts while still showing everyone else's. Read syncs to your own devices still go out.                                                                                                                                                             |
| `clear-urls`          | Strips tracking parameters (`utm_*`, `fbclid`, `si`, ...) from links in messages you send.                                                                                                                                                                                                      |
| `text-replace`        | Your own find/replace rules (plain or `/regex/`) applied to messages you send. `/replacetest` previews.                                                                                                                                                                                         |
| `snippets`            | Saved text inserted with your own slash commands (`name: text` per line); `/snip` lists them.                                                                                                                                                                                                   |
| `text-faces`          | `/tableflip`, `/unflip`, `/lenny`, `/disapprove`, `/hug` and more.                                                                                                                                                                                                                              |
| `notification-filter` | Hide notifications by keyword/sender, or only notify on matches. Never touches call notifications.                                                                                                                                                                                              |
| `read-all`            | `/readall` or `mod+alt+R` marks every chat read (respects your read-receipt setting).                                                                                                                                                                                                           |
| `blur-media`          | Blurs images, videos and link previews in chats until hover (or always); optional stickers/avatars. `mod+alt+B` toggles.                                                                                                                                                                        |
| `privacy-screen`      | Blurs the whole window on `mod+alt+H`, on focus loss, or after idle minutes. Not a lock.                                                                                                                                                                                                        |
| `compact-mode`        | Denser timeline: tighter bubbles and gaps, optional smaller text, hide group avatars.                                                                                                                                                                                                           |
| `quick-mute`          | `mod+alt+M` toggles mute on the open conversation.                                                                                                                                                                                                                                              |
| `focus-mode`          | `mod+alt+F` or `/focus` hides everything but the open chat.                                                                                                                                                                                                                                     |
| `stats-dashboard`     | `/stats` — session counters and busiest chats.                                                                                                                                                                                                                                                  |

Shortcuts use `mod+alt` (Ctrl+Alt, ⌘+Option on mac): Signal already uses
most `mod+shift+<letter>` combos.

## Adding one

1. Create `ts/beacon/addons/<id>.addon.std.ts` (`.dom.ts` if it touches
   `document`, `.preload.ts` if it imports app internals) exporting an
   `AddonManifest` — see `../addons.md` for the context API.
2. Import it in `../core/loader.preload.ts` and add it to `BUILTIN_MANIFESTS`
   (static import — see the comment there for why not `import()`).
3. `pnpm run beacon:build`, restart the app.

Keep `defaultEnabled` unset (false) unless a fresh install should really run
it — a Beacon build should not behave differently from Signal without the
user asking.
