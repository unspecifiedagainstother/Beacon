#!/usr/bin/env bash
# Beacon: rebuild stylesheets.
#
#   scripts/beacon/styles.sh           one-shot production build
#   scripts/beacon/styles.sh --watch   rebuild on every .scss change
#
# Runs inside the `mollydesk` distrobox and pins Node via nvm, so it works the
# same whether you invoke it from the host or from inside the container.
set -euo pipefail

# shellcheck source=scripts/beacon/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

beacon_enter_container "$@"
beacon_setup_node

if [ "${1:-}" = "--watch" ] || [ "${1:-}" = "-w" ]; then
  echo "beacon: watching .scss (Ctrl+C to stop) — Ctrl+R in the app to reload"
  exec pnpm run dev:styles
fi

echo "beacon: building styles (CSS only)..."
pnpm run build:styles:prod
echo "beacon: styles built. Ctrl+R in the running app to pick them up."
echo "beacon: note — this does NOT rebuild TypeScript. For .ts/.tsx changes"
echo "        run scripts/beacon/build.sh instead."
