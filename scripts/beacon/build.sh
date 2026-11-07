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

# shellcheck source=scripts/beacon/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

beacon_enter_container "$@"
beacon_setup_node

beacon_ensure_deps

echo "beacon: full rebuild (bundle + styles + locales)..."
beacon_run generate
touch bundles/preload/main.js

cat <<'EOF'

beacon: build complete.
  renderer-only change (components, styles) -> Ctrl+R in the app
  preload / main-process change             -> restart the app
EOF
