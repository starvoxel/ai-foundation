#!/usr/bin/env bash
# Claude Code cloud environment Setup script body (plan: cloud-setup-fast-start).
#
# Run as root by the environment's Setup script, after it has installed ai-foundation
# globally (see README, "Claude Code Cloud"). The result is cached, so the script must
# be idempotent: the environment build and the first session can run it concurrently.
# It downloads pinned `gh` and `bws` release binaries, verifies each against a hardcoded
# sha256 BEFORE installing it, and skips a tool already at the pinned version. A failure
# for one tool is logged and skipped; the script always exits 0 so session start never
# fails. It never reads or prints a token.
#
# To bump a tool: change its version, URL and sha256 together (checksum from the
# release's own checksum file), then bump the `# rev:` line in the environment's Setup
# script to rebuild the cache.
set -uo pipefail

BIN_DIR="${CLOUD_SETUP_BIN_DIR:-/usr/local/bin}"

GH_VERSION="2.102.0"
GH_URL="https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz"
GH_SHA256="bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386"

BWS_VERSION="2.1.0"
BWS_URL="https://github.com/bitwarden/sdk-sm/releases/download/bws-v${BWS_VERSION}/bws-x86_64-unknown-linux-gnu-${BWS_VERSION}.zip"
BWS_SHA256="ba8233c3a4aee5d43e3c73bbd04d99e9bc5aba13bbbfd06d89b073abe732b860"

log() { echo "cloud-setup: $*"; }
err() { echo "cloud-setup: ERROR: $*" >&2; }

# installed_version <tool>: first x.y.z printed by `<BIN_DIR>/<tool> --version`, or nothing.
installed_version() {
  [ -x "$BIN_DIR/$1" ] || return 0
  "$BIN_DIR/$1" --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1
}

# verify <sha256> <file>: succeeds only when the file's sha256 matches.
verify() {
  echo "$1  $2" | sha256sum -c - >/dev/null 2>&1
}

# extract_zip <zip> <member>: extracts one member into the current directory.
extract_zip() {
  if command -v unzip >/dev/null 2>&1; then
    unzip -o "$1" "$2" >/dev/null
  else
    python3 -m zipfile -e "$1" . >/dev/null
  fi
}

# place <src> <tool>: copies to a temp name in BIN_DIR, then renames, so a concurrent
# run never sees a half-written binary.
place() {
  local tmp="$BIN_DIR/.$2.$$"
  install -m 0755 "$1" "$tmp" && mv -f "$tmp" "$BIN_DIR/$2"
}

# provision <tool> <version> <url> <sha256> <archive-name> <extract-fn>
# Runs in a subshell so its temp directory is always cleaned up.
provision() (
  local tool="$1" version="$2" url="$3" sha="$4" archive="$5" extract="$6"
  local current work
  current="$(installed_version "$tool")"
  if [ "$current" = "$version" ]; then
    log "$tool $version already installed, skipped"
    return 0
  fi
  work="$(mktemp -d)" || { err "$tool: cannot create temp directory"; return 1; }
  trap 'rm -rf "$work"' EXIT
  cd "$work" || return 1
  log "$tool $version: downloading"
  if ! curl -fsSL -o "$archive" "$url"; then
    err "$tool $version: download failed"
    return 1
  fi
  if ! verify "$sha" "$archive"; then
    err "$tool $version: checksum mismatch, not installed"
    return 1
  fi
  "$extract" || { err "$tool $version: extract failed"; return 1; }
  place "$(cat src.path)" "$tool" || { err "$tool $version: install failed"; return 1; }
  log "$tool $version: installed to $BIN_DIR/$tool"
)

extract_gh() {
  tar -xzf gh.tar.gz || return 1
  echo "gh_${GH_VERSION}_linux_amd64/bin/gh" > src.path
}

extract_bws() {
  extract_zip bws.zip bws || return 1
  echo "bws" > src.path
}

failed=0
mkdir -p "$BIN_DIR" || { err "cannot create $BIN_DIR"; failed=1; }
provision gh "$GH_VERSION" "$GH_URL" "$GH_SHA256" gh.tar.gz extract_gh || failed=$((failed + 1))
provision bws "$BWS_VERSION" "$BWS_URL" "$BWS_SHA256" bws.zip extract_bws || failed=$((failed + 1))

if [ "$failed" -eq 0 ]; then
  log "done"
else
  err "done with $failed failure(s); the session will start without the missing tool(s)"
fi
exit 0
