#!/usr/bin/env bash
# AIF-012 Task 004 (W4/F1) - THROWAWAY SPIKE. SessionStart digest injector.
# Env: PRW_DIGEST file holding the digest text; PRW_LOG invocation log.
set -u
input="$(cat)"
src="$(printf '%s' "$input" | sed -n 's/.*"source": *"\([a-z]*\)".*/\1/p' | head -1)"
echo "$(date +%s) SessionStart source=$src" >> "${PRW_LOG:-/dev/null}"
[ -n "${PRW_DIGEST:-}" ] && [ -s "$PRW_DIGEST" ] || exit 0
printf 'PR-WATCH DIGEST (source=%s): ' "$src"
cat "$PRW_DIGEST"
