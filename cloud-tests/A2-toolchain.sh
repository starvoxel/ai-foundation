#!/bin/bash
# AIF-005 cloud test A2: time a prebuilt bws release binary (checksum-verified) against building bws with cargo.
# Run on its own: the cargo build is bounded at 280s and can by itself blow the five-minute cache budget.
BWS_VERSION="2.1.0"   # release tag bws-v2.1.0 and these asset names were read from the GitHub releases page
BASE="https://github.com/bitwarden/sdk-sm/releases/download/bws-v${BWS_VERSION}"
ASSET="bws-x86_64-unknown-linux-gnu-${BWS_VERSION}.zip"
LOG=/root/.claude/aif-setup.log
mkdir -p /root/.claude
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
now_ms() { echo $(( $(date +%s%N) / 1000000 )); }
unzip_to() { if command -v unzip > /dev/null; then unzip -oq "$1" -d "$2"; else python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"; fi; }
log "A2 start bws_on_path=$(command -v bws || echo none) unzip=$(command -v unzip || echo none)"
s=$(now_ms); rm -rf /tmp/bws-dl /tmp/bws-bin; mkdir -p /tmp/bws-dl /tmp/bws-bin
if curl -sSfL --max-time 120 -o "/tmp/bws-dl/$ASSET" "$BASE/$ASSET" \
   && curl -sSfL --max-time 60 -o /tmp/bws-dl/sums.txt "$BASE/bws-sha256-checksums-${BWS_VERSION}.txt"; then
  want=$(grep "$ASSET" /tmp/bws-dl/sums.txt | awk '{print $1}')
  got=$(sha256sum "/tmp/bws-dl/$ASSET" | awk '{print $1}')
  if [ -n "$want" ] && [ "$want" = "$got" ] && unzip_to "/tmp/bws-dl/$ASSET" /tmp/bws-bin; then
    chmod +x /tmp/bws-bin/bws
    log "bws binary: ok $(( $(now_ms) - s ))ms sha256 verified version=$(/tmp/bws-bin/bws --version 2>&1)"
  else
    log "bws binary: downloaded but checksum or unzip FAILED $(( $(now_ms) - s ))ms want=${want:-none} got=$got"
  fi
else
  log "bws binary: download FAILED $(( $(now_ms) - s ))ms url=$BASE/$ASSET"
fi
s=$(now_ms)
if timeout 280 cargo install bws --locked --root /tmp/bws-cargo > /tmp/cargo.out 2>&1; then r=ok; else r="FAILED/TIMEOUT($?)"; fi
log "bws cargo install: $r $(( $(now_ms) - s ))ms"
tail -n 2 /tmp/cargo.out | sed 's/^/    /' >> "$LOG"
log "A2 done"
exit 0
