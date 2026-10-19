#!/usr/bin/env bash
# Beacon: build if needed, then launch the app.
#
#   scripts/beacon/start.sh [options] [-- extra electron args]
#
#   --staging     staging servers (standalone device, not your account)
#   --prod        production servers — real account, linked-device slot
#                 (default, matches previous behaviour)
#   --build       force a full rebuild before starting
#   --no-build    skip the staleness check and start what's built
#   --debug       expose DevTools protocol on 127.0.0.1:9229
#                 (window.Beacon lives in the "Electron Isolated Context")
#   -h, --help    show this help
#
# Works from the host or inside the `mollydesk` distrobox; it re-enters the
# container itself. Installs dependencies and a pnpm shim on first run.
set -euo pipefail

# shellcheck source=scripts/beacon/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

MODE=prod
BUILD=auto
DEBUG=0
EXTRA=()

while [ $# -gt 0 ]; do
  case "$1" in
    --staging) MODE=staging ;;
    --prod | --production) MODE=prod ;;
    --build) BUILD=force ;;
    --no-build) BUILD=skip ;;
    --debug) DEBUG=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      EXTRA=("$@")
      break
      ;;
    *)
      usage >&2
      beacon_die "unknown option: $1"
      ;;
  esac
  shift
done

# Re-exec inside the container with the original arguments.
if [ ! -f /run/.containerenv ]; then
  args=()
  [ "$MODE" = staging ] && args+=(--staging)
  [ "$BUILD" = force ] && args+=(--build)
  [ "$BUILD" = skip ] && args+=(--no-build)
  [ "$DEBUG" = 1 ] && args+=(--debug)
  [ ${#EXTRA[@]} -gt 0 ] && args+=(-- "${EXTRA[@]}")
  beacon_enter_container "${args[@]}"
fi

beacon_setup_node
beacon_ensure_deps

case "$BUILD" in
  force)
    beacon_log "full rebuild..."
    pnpm run generate
    touch bundles/preload/main.js
    ;;
  auto)
    if beacon_build_is_stale; then
      beacon_log "sources changed since last build, rebuilding..."
      pnpm run generate
      touch bundles/preload/main.js
    else
      beacon_log "build is up to date"
    fi
    ;;
  skip) ;;
esac

ELECTRON_ARGS=(.)
if [ "$DEBUG" = 1 ]; then
  ELECTRON_ARGS=(--remote-debugging-port=9229 --remote-debugging-address=127.0.0.1 .)
  beacon_log "DevTools protocol on http://127.0.0.1:9229/json"
fi
if [ ${#EXTRA[@]} -gt 0 ]; then
  ELECTRON_ARGS+=("${EXTRA[@]}")
fi

if [ "$MODE" = staging ]; then
  # config/default.json points at *.staging.signal.org. Your phone cannot link
  # to it; register via File -> "Set Up as Standalone Device".
  beacon_log "starting against STAGING (standalone device, not your account)"
  exec pnpm exec electron "${ELECTRON_ARGS[@]}"
fi

beacon_log "starting against PRODUCTION — real Signal servers, real account."
beacon_log "  uses a linked-device slot and syncs real message history."
exec env NODE_ENV=production pnpm exec electron "${ELECTRON_ARGS[@]}"
