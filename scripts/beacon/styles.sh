#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=scripts/beacon/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

beacon_enter_container "$@"
beacon_setup_node

if [ "${1:-}" = "--watch" ] || [ "${1:-}" = "-w" ]; then
  echo "beacon: watching .scss (Ctrl+C to stop) — Ctrl+R in the app to reload"
  beacon_run dev:styles
fi

echo "beacon: building styles (CSS only)..."
beacon_run build:styles:prod
echo "beacon: styles built. Ctrl+R in the running app to pick them up."
echo "beacon: note — this does NOT rebuild TypeScript. For .ts/.tsx changes"
echo "        run scripts/beacon/build.sh instead."
