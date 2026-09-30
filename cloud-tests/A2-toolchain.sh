#!/bin/bash
# AIF-005 cloud test A2: time a prebuilt bws release binary against building bws with cargo.
# Run on its own: the cargo build is bounded at 280s and can by itself blow the five-minute cache budget.
BWS_VERSION="2.1.0"   # GUESS: the version and asset URL below are unverified; a failed probe is a valid result.
LOG=/root/.claude/aif-setup.log
mkdir -p /root/.claude
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
now_ms() { echo $(( $(date +%s%N) / 1000000 )); }
log "A2 start bws_on_path=$(command -v bws || echo none)"
s=$(now_ms)
URL="https://github.com/bitwarden/sdk-sm/releases/download/bws-v${BWS_VERSION}/bws-x86_64-unknown-linux-gnu-${BWS_VERSION}.zip"
if curl -sSfL --max-time 120 -o /tmp/bws.zip "$URL" && command -v unzip > /dev/null && unzip -oq /tmp/bws.zip -d /tmp/bws-bin; then
  log "bws binary: ok $(( $(now_ms) - s ))ms url=$URL"
  /tmp/bws-bin/bws --version >> "$LOG" 2>&1
else
  log "bws binary: FAILED $(( $(now_ms) - s ))ms url=$URL"
fi
s=$(now_ms)
if timeout 280 cargo install bws --locked --root /tmp/bws-cargo > /tmp/cargo.out 2>&1; then r=ok; else r="FAILED/TIMEOUT($?)"; fi
log "bws cargo install: $r $(( $(now_ms) - s ))ms"
tail -n 2 /tmp/cargo.out | sed 's/^/    /' >> "$LOG"
log "A2 done"
exit 0
