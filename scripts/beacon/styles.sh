#!/usr/bin/env bash
# Beacon: rebuild stylesheets.
#
#   scripts/beacon/styles.sh           one-shot production build
#   scripts/beacon/styles.sh --watch   rebuild on every .scss change
#
# Runs inside the `mollydesk` distrobox and pins Node via nvm, so it works the
# same whether you invoke it from the host or from inside the container.
set -euo pipefail

CONTAINER="${BEACON_CONTAINER:-mollydesk}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Build tooling (g++, native modules) only exists in the container — the
# secureblue host is immutable. Re-enter if we're outside.
if [ ! -f /run/.containerenv ]; then
  exec distrobox enter "$CONTAINER" -- "$0" "$@"
fi

cd "$REPO"

# The host has a stray Node v20 at ~/bin/node that shadows nvm when nvm isn't
# sourced. Source it explicitly and honour .nvmrc (24.17.0).
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use >/dev/null

if [ "${1:-}" = "--watch" ] || [ "${1:-}" = "-w" ]; then
  echo "beacon: watching .scss (Ctrl+C to stop) — Ctrl+R in the app to reload"
  exec pnpm run dev:styles
fi

echo "beacon: building styles (CSS only)..."
pnpm run build:styles:prod
echo "beacon: styles built. Ctrl+R in the running app to pick them up."
echo "beacon: note — this does NOT rebuild TypeScript. For .ts/.tsx changes"
echo "        run scripts/beacon/build.sh instead."
