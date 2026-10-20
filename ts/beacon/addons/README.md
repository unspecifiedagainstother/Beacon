# Builtin addons

Bundled addon modules. All disabled by default; enable in
Settings → Beacon → Modules (live, no restart) or with `/enable <id>`.

| Id                    | What it does                                                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message-logger`      | Keeps deleted-for-everyone messages readable (red, under the "deleted" notice) and indexes edits. `mod+alt+G` or `/messagelog` opens a searchable log with jump-to-message; `/exportlog`, `/clearlog`. Content is stored on the message in the encrypted DB; attachment files are not retained.             |
| `ghost-mode`          | Stops sending typing indicators and read receipts while still showing everyone else's. Read syncs to your own devices still go out.                                                                                                                                                                         |
| `clear-urls`          | Strips tracking parameters (`utm_*`, `fbclid`, `si`, ...) from links in messages you send.                                                                                                                                                                                                                  |
| `text-replace`        | Your own find/replace rules (plain or `/regex/`) applied to messages you send. `/replacetest` previews.                                                                                                                                                                                                     |
| `snippets`            | Saved text inserted with your own slash commands (`name: text` per line); `/snip` lists them.                                                                                                                                                                                                               |
| `text-faces`          | `/tableflip`, `/unflip`, `/lenny`, `/disapprove`, `/hug` and more.                                                                                                                                                                                                                                          |
| `notification-filter` | Hide notifications by keyword/sender, or only notify on matches. Never touches call notifications.                                                                                                                                                                                                          |
| `read-all`            | `/readall` or `mod+alt+R` marks every chat read (respects your read-receipt setting).                                                                                                                                                                                                                       |
| `blur-media`          | Blurs images, videos and link previews in chats until hover (or always); optional stickers/avatars. `mod+alt+B` toggles.                                                                                                                                                                                    |
| `privacy-screen`      | Blurs the whole window on `mod+alt+H`, on focus loss, or after idle minutes. Not a lock.                                                                                                                                                                                                                    |
| `compact-mode`        | Denser timeline: tighter bubbles and gaps, optional smaller text, hide group avatars.                                                                                                                                                                                                                       |
| `quick-mute`          | `mod+alt+M` toggles mute on the open conversation.                                                                                                                                                                                                                                                          |
| `focus-mode`          | `mod+alt+F` or `/focus` hides everything but the open chat.                                                                                                                                                                                                                                                 |
| `purge-messages`      | Adds **Purge Messages** to the chat ⋯ menu (and `/purge`): deletes all _your_ messages in that chat for everyone after a confirm showing counts. Only messages inside Signal's delete-for-everyone window (24 h by default) can be removed for everyone; older ones can optionally be deleted for you only. |
| `profile-history`     | Records profile changes (names, usernames, about, avatars with thumbnails, numbers, optionally groups and your saved names) in the encrypted DB, including changes made while Beacon was closed. `/profilelog`, `mod+alt+P`, or **Profile history** in the chat menu.                                       |
| `stats-dashboard`     | `/stats` — session counters and busiest chats.                                                                                                                                                                                                                                                              |

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
