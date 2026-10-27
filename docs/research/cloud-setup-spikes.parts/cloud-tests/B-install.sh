#!/bin/bash
# AIF-005 cloud test B (also the base for test D): install a pinned ai-foundation, install the bundle for Claude,
# verify the agent exists, merge it into user settings, and log everything. Always exits 0.
# This also covers the old stage A: env facts are always logged, and if the fetch fails the log says which of
# git, the codeload tarball, or npm is blocked.
REF="95156a2373883f3b982067855585dc41da671294"   # pin a tag or full commit SHA; changing it installs a different ai-foundation
REV=1                                             # increment to force a rebuild of the cached environment without changing REF
BUNDLES="engineering"                             # comma-separated
AGENT="engineering-manager"
LOG=/root/.claude/aif-setup.log
WORK=/opt/aif
mkdir -p /root/.claude
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
now() { date +%s; }
log "B start rev=$REV ref=$REF bundles=$BUNDLES agent=$AGENT host=$(hostname) node=$(node -v 2>&1) npm=$(npm -v 2>&1)"
log "env: HTTPS_PROXY=${HTTPS_PROXY:+set} GITHUB_TOKEN=${GITHUB_TOKEN:+set} GH_TOKEN=${GH_TOKEN:+set} bws=$(command -v bws || echo none) cargo=$(command -v cargo || echo none) gh=$(command -v gh || echo none)"
t0=$(now)
rm -rf "$WORK" && mkdir -p "$WORK" && cd "$WORK" || { log "cannot create $WORK"; exit 0; }
npm init -y > /dev/null 2>&1
s=$(now)
if npm install --no-audit --no-fund "github:starvoxel/ai-foundation#$REF" >> "$LOG" 2>&1; then
  log "npm install ok $(( $(now) - s ))s"
else
  log "npm install FAILED after $(( $(now) - s ))s; nothing installed, agent not set"
  for probe in "git ls-remote https://github.com/starvoxel/ai-foundation.git HEAD" \
               "curl -sSfI https://codeload.github.com/starvoxel/ai-foundation/tar.gz/$REF" \
               "npm ping"; do
    if timeout 60 $probe > /tmp/aif-probe.out 2>&1; then log "diagnostic ok: $probe"; else log "diagnostic FAILED($?): $probe :: $(tail -n 1 /tmp/aif-probe.out)"; fi
  done
  exit 0
fi
s=$(now)
if "$WORK/node_modules/.bin/aif" install -B "$BUNDLES" -H claude >> "$LOG" 2>&1; then
  log "aif install ok $(( $(now) - s ))s"
else
  log "aif install FAILED after $(( $(now) - s ))s; agent not set"; exit 0
fi
# Put aif and ai-git on PATH: the steering requires ai-git, and the installed block-command hook blocks raw git.
for bin in aif ai-git; do
  if ln -sf "$WORK/node_modules/.bin/$bin" "/usr/local/bin/$bin"; then log "linked $bin"; else log "linking $bin FAILED"; fi
done
log "on PATH: aif=$(command -v aif || echo none) ai-git=$(command -v ai-git || echo none)"
if [ -f "/root/.claude/agents/$AGENT.md" ]; then
  if AGENT="$AGENT" node -e '
    const fs = require("fs");
    const p = "/root/.claude/settings.json";
    let s = {};
    if (fs.existsSync(p)) { s = JSON.parse(fs.readFileSync(p, "utf8")); }
    s.agent = process.env.AGENT;
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  ' >> "$LOG" 2>&1; then
    log "agent set to $AGENT"
  else
    log "settings merge FAILED (settings.json left untouched if it was not valid JSON); agent not set"
  fi
else
  log "agent file /root/.claude/agents/$AGENT.md missing; agent NOT set (default agent will run)"
fi
log "B done total $(( $(now) - t0 ))s"
exit 0
