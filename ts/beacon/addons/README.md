# Builtin addons

Bundled addon modules. All disabled by default; enable in
Settings → Beacon → Modules (live, no restart) or via `/enable <id>`.

| Id | What it does |
| --- | --- |
| `ghost-mode` | Hide typing indicators + status ticks in the UI. Cosmetic only — does not stop this device sending typing/read receipts. |
| `message-logger` | Log sent/received messages via the real message hooks. `/exportlog`, `/clearlog`. Local-only, capped at 5000 entries. |
| `quick-mute` | `mod+m` toggles mute on the active conversation using the app's own mute action. |
| `focus-mode` | `mod+shift+f` or `/focus` hides everything but the open chat. |
| `stats-dashboard` | Session counters; `/stats` prints them into the composer. |

## Adding one

1. Create `ts/beacon/addons/<id>.addon.std.ts` (`.dom.ts` if it touches `document`) exporting an `AddonManifest`
   (see `../addons.md` for the full context API).
2. Add its import to `loadBuiltinManifests()` in `../core/loader.preload.ts`.
3. `pnpm run beacon:build`, restart the app.

Keep `defaultEnabled` unset (false) unless a fresh install should really run
it — a Beacon build should not behave differently from Signal without the
user asking.
