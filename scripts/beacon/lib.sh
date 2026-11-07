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

beacon_enter_container() {
  if [ -f /run/.containerenv ]; then
    return 0
  fi
  beacon_log "entering the $BEACON_CONTAINER container..."

  command -v distrobox >/dev/null ||
    beacon_die "not in a container and distrobox is not installed"
  exec distrobox enter "$BEACON_CONTAINER" -- "$0" "$@"
}

beacon_setup_node() {
  cd "$BEACON_REPO"
  beacon_log "preparing Node $(cat .nvmrc) + pnpm..."

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] || beacon_die "nvm not found at $NVM_DIR"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  if ! nvm use >/dev/null 2>&1; then
    beacon_log "installing Node $(cat .nvmrc) via nvm..."
    nvm install >/dev/null || beacon_die "nvm install failed"
    nvm use >/dev/null
  fi

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
  export pnpm_config_verify_deps_before_run=false
  export npm_config_verify_deps_before_run=false
}

beacon_run() {
  pnpm run "$@"
}

beacon_ensure_deps() {
  local stamp=node_modules/.modules.yaml
  local reason=""
  if [ ! -x node_modules/.bin/electron ] || [ ! -x node_modules/.bin/rolldown ]; then
    reason="dependencies missing"
  elif [ pnpm-lock.yaml -nt "$stamp" ] || [ package.json -nt "$stamp" ] ||
    [ pnpm-workspace.yaml -nt "$stamp" ]; then
    reason="lockfile or package.json changed"
  fi
  if [ -n "$reason" ]; then
    beacon_log "$reason, installing from the lockfile..."
    pnpm install --frozen-lockfile --config.confirm-modules-purge=false
    touch "$stamp"
  fi
  if ! beacon_native_ok; then
    beacon_log "native bindings missing or wrong platform, reinstalling..."
    pnpm install --frozen-lockfile --force --config.confirm-modules-purge=false
    beacon_native_ok || beacon_die "native bindings still fail to load — see output above"
  fi
}

beacon_native_ok() {
  node --input-type=module -e '
    try {
      await import("rolldown");
    } catch (e) {
      console.error("  " + String(e.cause?.message ?? e.message).split("\n")[0]);
      process.exit(1);
    }
  '
}

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
