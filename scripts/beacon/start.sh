#!/usr/bin/env bash
# Beacon: launch the app against Signal's PRODUCTION servers.
#
#   scripts/beacon/start.sh          production (real account, links to phone)
#   scripts/beacon/start.sh --staging   staging servers (standalone device)
#
# Runs inside the `mollydesk` distrobox and pins Node via nvm.
set -euo pipefail

CONTAINER="${BEACON_CONTAINER:-mollydesk}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Electron's Chromium sandbox needs a user namespace. secureblue blocks
# unprivileged userns on the host, but podman already established one for the
# container — so the app only starts from inside. Re-enter if we're outside.
if [ ! -f /run/.containerenv ]; then
  exec distrobox enter "$CONTAINER" -- "$0" "$@"
fi

cd "$REPO"

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use >/dev/null

if [ "${1:-}" = "--staging" ]; then
  # config/default.json points at *.staging.signal.org. Your phone cannot link
  # to it; register via File -> "Set Up as Standalone Device".
  echo "beacon: starting against STAGING (standalone device, not your account)"
  exec pnpm start
fi

echo "beacon: starting against PRODUCTION — real Signal servers, real account."
echo "        This uses a linked-device slot and syncs real message history."
exec env NODE_ENV=production pnpm start
