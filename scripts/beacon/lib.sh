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
  beacon_log "entering the $BEACON_CONTAINER container..."

  command -v distrobox >/dev/null ||
    beacon_die "not in a container and distrobox is not installed"
  # $0 is the calling script, not this file.
  exec distrobox enter "$BEACON_CONTAINER" -- "$0" "$@"
}

beacon_setup_node() {
  cd "$BEACON_REPO"
  beacon_log "preparing Node $(cat .nvmrc) + pnpm..."

  # The host has a stray Node v20 at ~/bin/node that shadows nvm when nvm
  # isn't sourced. Source it explicitly and honour .nvmrc.
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] || beacon_die "nvm not found at $NVM_DIR"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  if ! nvm use >/dev/null 2>&1; then
    # Upstream bumps .nvmrc on most releases; fetch it instead of failing.
    beacon_log "installing Node $(cat .nvmrc) via nvm..."
    nvm install >/dev/null || beacon_die "nvm install failed"
    nvm use >/dev/null
  fi

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
  # The workspace sets verifyDepsBeforeRun: prompt. In a real terminal that
  # prompt can sit behind redirected output and hang forever; reconcile
  # automatically instead, for this script and every nested `pnpm run`.
  export pnpm_config_verify_deps_before_run=install
  export npm_config_verify_deps_before_run=install
  # ...and never stop to ask before re-creating node_modules.
  export pnpm_config_confirm_modules_purge=false
  export npm_config_confirm_modules_purge=false
}

# Run a package.json script with pnpm. Not Bun: Bun rewrites `pnpm run` inside
# package scripts to `bun run`, and Signal's pipeline relies on pnpm-only
# regex scripts (`pnpm run "/^build:styles:(sass|tailwind):prod$/"`).
# Bun is the host-side launcher instead — see package.json beacon:* scripts.
beacon_run() {
  pnpm run "$@"
}

# Never install with CI=true: pnpm 11 derives settings such as
# enableGlobalVirtualStore from CI, so a CI install fails verifyDepsBeforeRun
# on every later non-CI `pnpm run`.
#
# node_modules can end up stripped (no .bin) or out of sync with the lockfile;
# either way the app won't build or start.
beacon_ensure_deps() {
  if [ ! -x node_modules/.bin/electron ] || [ ! -x node_modules/.bin/rolldown ]; then
    beacon_log "dependencies missing, running pnpm install (first run is slow)..."
    pnpm install --config.confirm-modules-purge=false --frozen-lockfile
  fi
  # An install from a different environment (e.g. a host pnpm) can leave the
  # native bindings for the wrong platform/libc. Load them to be sure.
  if ! beacon_native_ok; then
    beacon_log "native bindings missing or wrong platform, reinstalling..."
    pnpm install --config.confirm-modules-purge=false --force --frozen-lockfile
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
