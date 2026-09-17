#!/usr/bin/env bash
# Heartbeat hook: on Stop and SessionEnd, logs a UTC timestamp and commits +
# pushes immediately. Stop fires the moment a turn ends (idle clock starts);
# SessionEnd fires with a hard ~5s grace period before the container is
# force-killed on reclamation. Diffing the git commit timestamps for the
# last "event=Stop" entry and the following "event=SessionEnd" entry gives
# the actual elapsed idle time before reclamation.
#
# Best-effort only: every step is time-capped and failures are swallowed so
# this never blocks the session from stopping or ending.
set -uo pipefail
trap 'exit 0' ERR

[ "${CLAUDE_HEARTBEAT_DISABLE:-}" = "1" ] && exit 0

INPUT="$(cat)"
EVENT=$(printf '%s' "$INPUT" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4)
SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
REASON=$(printf '%s' "$INPUT" | grep -o '"reason":"[^"]*"' | head -1 | cut -d'"' -f4)

TS="$(date -u +%FT%T.%3NZ)"

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

LOG=".claude/hooks/heartbeat.log"
echo "${TS} event=${EVENT:-unknown} session=${SESSION_ID:-unknown} reason=${REASON:-}" >> "$LOG"

# SessionEnd has a hard ~5s grace period before SIGKILL; keep well under it.
TIMEOUT=15
[ "$EVENT" = "SessionEnd" ] && TIMEOUT=3

timeout "$TIMEOUT" git add "$LOG" >/dev/null 2>&1
timeout "$TIMEOUT" git commit -m "heartbeat: ${EVENT:-unknown} at ${TS}" >/dev/null 2>&1
timeout "$TIMEOUT" git push origin HEAD >/dev/null 2>&1

exit 0
