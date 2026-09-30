#!/bin/bash
# AIF-005 cloud test B (also the base for test D): install a pinned ai-foundation, install the bundle for Claude,
# verify the agent exists, merge it into user settings, and log everything. Always exits 0.
REF="95156a2373883f3b982067855585dc41da671294"   # pin a tag or full commit SHA; change it to rebuild the cache
BUNDLES="engineering"                             # comma-separated
AGENT="engineering-manager"
LOG=/root/.claude/aif-setup.log
WORK=/opt/aif
mkdir -p /root/.claude
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
now() { date +%s; }
log "B start ref=$REF bundles=$BUNDLES agent=$AGENT"
t0=$(now)
rm -rf "$WORK" && mkdir -p "$WORK" && cd "$WORK" || { log "cannot create $WORK"; exit 0; }
npm init -y > /dev/null 2>&1
s=$(now)
if npm install --no-audit --no-fund "github:starvoxel/ai-foundation#$REF" >> "$LOG" 2>&1; then
  log "npm install ok $(( $(now) - s ))s"
else
  log "npm install FAILED after $(( $(now) - s ))s; nothing installed, agent not set"; exit 0
fi
s=$(now)
if "$WORK/node_modules/.bin/aif" install -B "$BUNDLES" -H claude >> "$LOG" 2>&1; then
  log "aif install ok $(( $(now) - s ))s"
else
  log "aif install FAILED after $(( $(now) - s ))s; agent not set"; exit 0
fi
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
