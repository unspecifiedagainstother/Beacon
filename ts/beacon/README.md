# Beacon features

Beacon-specific code lives here. The goal is to keep edits to upstream Signal
files small and fixed in size, so rebasing on upstream stays cheap no matter how
many features get added.

Two systems live side by side:

- **Feature toggles** (this file) — boolean settings in Settings → Beacon,
  driven by the `BEACON_FEATURES` registry below.
- **Addon platform** (`core/`, `addons/`, see `addons.md`) — runnable modules
  with hooks, action interception, patching, commands, and live
  enable/disable.

## Running

From the host, launch through Bun (it only runs the script — it never
verifies or reinstalls dependencies, which a host-side pnpm can get wrong):

```sh
bun run beacon:start:prod     # real account (link your phone)
bun run beacon:start:debug    # same, with DevTools protocol on 127.0.0.1:9229
bun run beacon:start:staging  # staging servers, standalone test device
bun run beacon:build          # full rebuild
```

or call `scripts/beacon/start.sh --help` directly. The scripts re-enter the
`mollydesk` distrobox, install the `.nvmrc` Node and a pnpm shim, install
dependencies on first run, and rebuild only when sources are newer than the
bundle.

Inside the container, dependency installs and the build pipeline stay on
pnpm: the lockfile and its release-age/trust guards live in
`pnpm-workspace.yaml`, and Bun rewrites the pnpm-only regex scripts the
build uses (`pnpm run "/^build:styles:(sass|tailwind):prod$/"`).

## Adding a toggle setting

Two steps.

**1. Add an entry to `BEACON_FEATURES` in `features.std.ts`:**

```ts
{
  key: 'beaconHideProfileNames',
  labelKey: 'icu:Preferences__hide-profile-names',
  descriptionKey: 'icu:Preferences__hide-profile-names--description',
  defaultValue: false,
},
```

**2. Add the two strings to `_locales/en/messages.json`:**

```json
"icu:Preferences__hide-profile-names": {
  "messageformat": "Hide profile names",
  "description": "Beacon setting to hide contact names in the chat list"
},
"icu:Preferences__hide-profile-names--description": {
  "messageformat": "Show initials instead of full names.",
  "description": "Explanation of the Hide profile names setting"
}
```

Then `pnpm run beacon:build`. The checkbox appears under Settings → Beacon,
persists, and survives unlinking. Nothing else to wire.

## What the registry generates

| Derived                               | Where                                                       |
| ------------------------------------- | ----------------------------------------------------------- |
| Storage key type (`beaconX: boolean`) | `ts/types/StorageKeys.std.ts` via `BeaconStorageKeys`       |
| Unlink policy (preserved on unlink)   | same file, via `...BEACON_FEATURE_KEYS`                     |
| Checkbox in Settings → Beacon         | `ts/components/Preferences.dom.tsx` maps `BEACON_FEATURES`  |
| Redux read/write                      | `ts/state/smart/Preferences.preload.tsx` loops the registry |
| Storybook props                       | `getBeaconDefaults()`                                       |

Upstream files touched: 4, at a fixed diff size. Adding the 50th feature costs
the same as the 1st.

## Consuming a feature value

In the Preferences UI, values arrive as `beaconSettings[key]`.

Elsewhere in the renderer, read it from items storage the same way other
settings are read — the key is typed, so autocomplete works.

For styling, prefer a container class over per-element props: put
`beaconSettings.beaconX && 'Beacon--x'` on a wrapper and target descendants in
`stylesheets/_beacon-theme.scss`. One CSS rule then covers every child, and
upstream-added markup is covered automatically.

## Gotchas learned the hard way

- **Mark PII with `Beacon-pii`, not upstream class names.** Blur PII used to
  target `.Preferences__flow-value`; upstream moved those rows to
  `AxoTextItem` and the blur silently stopped matching. Wrap the value in
  `<span className="Beacon-pii">`; the runtime puts `Beacon--blur-pii` on
  `<body>` from the setting.
- **Never put a `transition` on a privacy filter.** `transition: filter`
  animates from clear to blurred on mount, so the value is legible for the
  duration of the animation. See the Blur PII rules in `_beacon-theme.scss`.
- **`defaultValue: false` unless you mean it.** A feature that defaults on makes
  Beacon behave differently from Signal without the user asking.
- **Storage keys must start with `beacon`** — enforced by the type. Keeps them
  identifiable in the DB and collision-free against upstream keys.
- **Rebuild TypeScript, not just styles.** `scripts/beacon/styles.sh` is CSS
  only; use `scripts/beacon/build.sh` after touching `.ts`/`.tsx`, and restart
  the app (not `Ctrl+R`) for preload or main-process changes.

## Non-toggle features

The registry covers booleans. Anything with more shape — a dropdown, a text
field, a sub-page — still needs bespoke wiring. Extend `BeaconFeature` with a
discriminated union (`kind: 'toggle' | 'select'`) when the first one appears,
rather than pre-building it now.
