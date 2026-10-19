# Beacon: shared setup for scripts/beacon/*.sh. Source it, don't run it.
#
#   . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#   beacon_enter_container "$@"   # re-execs the caller inside distrobox
#   beacon_setup_node             # nvm + pnpm on PATH, cwd = repo root
#
# shellcheck shell=bash

BEACON_CONTAINER="${BEACON_CONTAINER:-mollydesk}"
BEACON_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

beacon_log() {
  printf '\033[1;34mbeacon:\033[0m %s\n' "$*"
}

beacon_die() {
  printf '\033[1;31mbeacon:\033[0m %s\n' "$*" >&2
  exit 1
}

# Electron's Chromium sandbox needs a user namespace and the build needs the
# container's toolchain. secureblue blocks unprivileged userns on the host,
# but podman already set one up for the container — so everything runs inside.
beacon_enter_container() {
  if [ -f /run/.containerenv ]; then
    return 0
  fi
  command -v distrobox >/dev/null ||
    beacon_die "not in a container and distrobox is not installed"
  # $0 is the calling script, not this file.
  exec distrobox enter "$BEACON_CONTAINER" -- "$0" "$@"
}

beacon_setup_node() {
  cd "$BEACON_REPO"

  # The host has a stray Node v20 at ~/bin/node that shadows nvm when nvm
  # isn't sourced. Source it explicitly and honour .nvmrc.
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] || beacon_die "nvm not found at $NVM_DIR"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null || beacon_die "nvm: install the Node in .nvmrc: nvm install"

  # nvm's Node ships corepack but no pnpm binary, and package scripts call
  # `pnpm` by name, so `corepack pnpm install` alone fails halfway through.
  # Put real shims on PATH, outside the repo.
  if ! command -v pnpm >/dev/null; then
    local shim_dir="${XDG_CACHE_HOME:-$HOME/.cache}/beacon/bin"
    if [ ! -x "$shim_dir/pnpm" ]; then
      beacon_log "installing pnpm shim via corepack -> $shim_dir"
      mkdir -p "$shim_dir"
      corepack enable --install-directory "$shim_dir" ||
        beacon_die "corepack failed to install pnpm"
    fi
    export PATH="$shim_dir:$PATH"
  fi
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
}

# node_modules can end up stripped (no .bin) or out of sync with the lockfile;
# either way the app won't build or start.
beacon_ensure_deps() {
  if [ ! -x node_modules/.bin/electron ] || [ ! -x node_modules/.bin/rolldown ]; then
    beacon_log "dependencies missing, running pnpm install (first run is slow)..."
    CI=true pnpm install --frozen-lockfile
    return
  fi
  # Editing package.json invalidates pnpm's verifyDepsBeforeRun check, and it
  # cannot prompt non-interactively. Reconcile instead of failing later.
  if ! pnpm run --silent get-expire-time >/dev/null 2>&1; then
    beacon_log "lockfile out of date, reconciling..."
    CI=true pnpm install
  fi
  # An install from a different environment (e.g. a host pnpm) can leave the
  # native bindings for the wrong platform/libc. Load them to be sure.
  if ! beacon_native_ok; then
    beacon_log "native bindings missing or wrong platform, reinstalling..."
    CI=true pnpm install --force --frozen-lockfile
    beacon_native_ok || beacon_die "native bindings still fail to load — see output above"
  fi
}

beacon_native_ok() {
  # rolldown is the first native module the build touches; if its binding
  # loads, the install matched this platform.
  node --input-type=module -e '
    try {
      await import("rolldown");
    } catch (e) {
      console.error("  " + String(e.cause?.message ?? e.message).split("\n")[0]);
      process.exit(1);
    }
  '
}

# True if any source file is newer than the built preload bundle.
beacon_build_is_stale() {
  local bundle="bundles/preload/main.js"
  [ -f "$bundle" ] || return 0
  [ -f stylesheets/manifest.css ] || return 0
  [ -n "$(find ts app stylesheets _locales protos package.json \
    -newer "$bundle" \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.scss' -o -name '*.json' \
       -o -name '*.proto' \) \
    -not -path '*/node_modules/*' -print -quit 2>/dev/null)" ]
}
