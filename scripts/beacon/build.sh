#!/usr/bin/env bash
# Beacon: rebuild everything — TS bundle, styles, locale types, protobuf.
#
#   scripts/beacon/build.sh
#
# Use this after editing .ts/.tsx. `styles.sh` only rebuilds CSS, so a TS change
# built with that alone will not appear in the running app.
#
# Runs inside the `mollydesk` distrobox and pins Node via nvm.
set -euo pipefail

CONTAINER="${BEACON_CONTAINER:-mollydesk}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ ! -f /run/.containerenv ]; then
  exec distrobox enter "$CONTAINER" -- "$0" "$@"
fi

cd "$REPO"

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use >/dev/null

# Editing package.json invalidates pnpm's verifyDepsBeforeRun check, and it
# cannot prompt non-interactively. Reconcile automatically instead of failing.
if ! pnpm run --silent get-expire-time >/dev/null 2>&1; then
  echo "beacon: lockfile out of date, reconciling..."
  CI=true pnpm install
fi

echo "beacon: full rebuild (bundle + styles + locales)..."
pnpm run generate

cat <<'EOF'

beacon: build complete.
  renderer-only change (components, styles) -> Ctrl+R in the app
  preload / main-process change             -> restart the app
EOF
