#!/usr/bin/env bash
# Stop hook: opportunistically compacts this session's persisted transcript
# once it has grown enough since the last compaction.
#
# Why: Claude Code Cloud has no hook that fires before a session's VM is
# reclaimed for inactivity - SessionEnd only fires after a shutdown signal,
# with a hard 5s grace period before force-kill, which is too short for a
# real LLM-driven /compact call. `Stop` fires the moment Claude finishes a
# turn, which is exactly when the idle clock that can eventually lead to
# reclamation starts - the earliest safe point to act. Compacting here
# (out-of-band, via `claude -p "/compact" --resume`) means that if this
# session later gets reclaimed and resumed, the resume replays a small
# compacted tail instead of the full history.
#
# Runs synchronously so the live process is not writing to the transcript
# while this reads/appends to it. Never blocks the session from stopping -
# any failure here is swallowed.
set -uo pipefail
trap 'exit 0' ERR

[ "${CLAUDE_IDLE_COMPACT_DISABLE:-}" = "1" ] && exit 0

# Cloud-only by default; set CLAUDE_IDLE_COMPACT_FORCE=1 to test locally.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ "${CLAUDE_IDLE_COMPACT_FORCE:-}" != "1" ]; then
  exit 0
fi

INPUT="$(cat)"

SESSION_ID=$(printf '%s' "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
TRANSCRIPT=$(printf '%s' "$INPUT" | grep -o '"transcript_path":"[^"]*"' | head -1 | cut -d'"' -f4)

[ -n "$SESSION_ID" ] && [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ] || exit 0

CLAUDE_BIN="$(command -v claude || echo "${CLAUDE_CODE_EXECPATH:-claude}")"

STATE_DIR="/tmp/.claude-idle-compact"
mkdir -p "$STATE_DIR"
MARKER="$STATE_DIR/${SESSION_ID}.lastsize"
LOG="$STATE_DIR/${SESSION_ID}.log"

CURRENT_SIZE=$(wc -c < "$TRANSCRIPT" 2>/dev/null || echo 0)
LAST_SIZE=0
[ -f "$MARKER" ] && LAST_SIZE=$(cat "$MARKER" 2>/dev/null || echo 0)

THRESHOLD_BYTES="${CLAUDE_IDLE_COMPACT_THRESHOLD_BYTES:-40000}"
GROWTH=$(( CURRENT_SIZE - LAST_SIZE ))

if [ "$GROWTH" -lt "$THRESHOLD_BYTES" ]; then
  exit 0
fi

{
  echo "---- $(date -u +%FT%TZ) compacting session=$SESSION_ID growth=${GROWTH}B ----"
} >> "$LOG"

if "$CLAUDE_BIN" -p "/compact" --resume "$SESSION_ID" >>"$LOG" 2>&1; then
  echo "$CURRENT_SIZE" > "$MARKER"
fi

exit 0
