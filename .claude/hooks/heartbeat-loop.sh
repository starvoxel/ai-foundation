#!/usr/bin/env bash
# SessionStart hook: launches a detached background loop that appends a
# heartbeat line and commits+pushes to git every 30s, independent of any
# other hook firing. Stop/SessionEnd hooks have proven unreliable in this
# harness (Stop never fired for real turns; SessionEnd fired repeatedly
# without the container actually being reclaimed), so this measures raw
# process liveness directly: the timestamp of the last successful tick is
# the last point the process was known alive, regardless of which hooks
# did or didn't run around it.
#
# Guarded against duplicate loops: SessionStart may fire more than once
# for the same underlying container (e.g. on each resume), so this checks
# for an already-running loop for the session before spawning another.
set -uo pipefail
trap 'exit 0' ERR

[ "${CLAUDE_HEARTBEAT_LOOP_DISABLE:-}" = "1" ] && exit 0

INPUT="$(cat)"
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$SESSION_ID" ] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
STATE_DIR="/tmp/.claude-heartbeat-loop"
mkdir -p "$STATE_DIR" 2>/dev/null || exit 0
PIDFILE="$STATE_DIR/${SESSION_ID}.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  exit 0
fi

LOG=".claude/hooks/heartbeat.log"

nohup bash -c '
  cd "$1" || exit 0
  SID="$2"
  LOG="$3"
  while true; do
    TS="$(date -u +%FT%T.%3NZ)"
    echo "${TS} event=tick session=${SID}" >> "$LOG"
    timeout 5 git add "$LOG" >/dev/null 2>&1
    timeout 5 git commit -m "heartbeat: tick at ${TS}" >/dev/null 2>&1
    if ! timeout 8 git push origin HEAD >/dev/null 2>&1; then
      BR="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
      timeout 5 git fetch origin "$BR" >/dev/null 2>&1
      timeout 8 git rebase "origin/$BR" >/dev/null 2>&1
      timeout 8 git push origin HEAD >/dev/null 2>&1
    fi
    sleep 30
  done
' _ "$PROJECT_DIR" "$SESSION_ID" "$LOG" >>"$STATE_DIR/${SESSION_ID}.out" 2>&1 &

echo $! > "$PIDFILE"
disown
exit 0
