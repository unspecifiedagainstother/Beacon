# Builtin addons

Bundled addon modules. All disabled by default; enable in
Settings → Beacon → Modules (live, no restart) or with `/enable <id>`.

| Id                    | What it does                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message-logger`      | Keeps deleted-for-everyone messages readable (red, under the "deleted" notice) and indexes edits. `mod+shift+L` or `/messagelog` opens a searchable log with jump-to-message; `/exportlog`, `/clearlog`. Content is stored on the message in the encrypted DB; attachment files are not retained. |
| `ghost-mode`          | Stops sending typing indicators and read receipts while still showing everyone else's. Read syncs to your own devices still go out.                                                                                                                                                               |
| `clear-urls`          | Strips tracking parameters (`utm_*`, `fbclid`, `si`, ...) from links in messages you send. Configurable list.                                                                                                                                                                                     |
| `notification-filter` | Hide notifications by keyword/sender, or only notify on matches. Never touches call notifications.                                                                                                                                                                                                |
| `quick-mute`          | `mod+M` toggles mute on the open conversation.                                                                                                                                                                                                                                                    |
| `focus-mode`          | `mod+shift+F` or `/focus` hides everything but the open chat.                                                                                                                                                                                                                                     |
| `stats-dashboard`     | `/stats` — session counters and busiest chats.                                                                                                                                                                                                                                                    |

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
