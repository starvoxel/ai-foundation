#!/bin/bash
# AIF-005 cloud test A: probe reach and timing from the Setup script. Installs nothing, sets no agent.
REF="95156a2373883f3b982067855585dc41da671294"
LOG=/root/.claude/aif-setup.log
mkdir -p /root/.claude
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
now_ms() { echo $(( $(date +%s%N) / 1000000 )); }
timed() { # timed <label> <command...>
  local label="$1"; shift
  local s; s=$(now_ms)
  if timeout 120 "$@" > /tmp/aif-probe.out 2>&1; then local r=ok; else local r="FAILED($?)"; fi
  log "probe $label: $r $(( $(now_ms) - s ))ms"
  tail -n 2 /tmp/aif-probe.out | sed 's/^/    /' >> "$LOG"
}
log "A start ref=$REF host=$(hostname) node=$(node -v 2>&1) npm=$(npm -v 2>&1)"
log "tools: bws=$(command -v bws || echo none) cargo=$(command -v cargo || echo none) gh=$(command -v gh || echo none) git=$(command -v git || echo none)"
log "env: HTTPS_PROXY=${HTTPS_PROXY:+set} GITHUB_TOKEN=${GITHUB_TOKEN:+set} GH_TOKEN=${GH_TOKEN:+set}"
timed "git ls-remote" git ls-remote https://github.com/starvoxel/ai-foundation.git HEAD
timed "codeload tarball HEAD request" curl -sSfI "https://codeload.github.com/starvoxel/ai-foundation/tar.gz/$REF"
timed "npm registry ping" npm ping
mkdir -p /tmp/aif-probe && cd /tmp/aif-probe && npm init -y > /dev/null 2>&1
timed "npm install github ref" npm install --no-audit --no-fund "github:starvoxel/ai-foundation#$REF"
log "A done"
exit 0
