#!/usr/bin/env bash
# AIF-012 Task 004 (W4/C2) - THROWAWAY SPIKE. Not wired into any agent, bundle or settings.
# Stop hook prototype: block turn end while a fake "pending PR" flag exists.
# Env: PRW_FLAG   path of fake pending flag (file; its content = reason text)
#      PRW_HELPER path of the (fake) helper; if missing the hook fails open (exit 0)
#      PRW_MODE   "always" (block every time; tests loop/cap) | "once" (honour stop_hook_active)
#      PRW_LOG    invocation log (one line per call)
set -u
input="$(cat)"
active=false
case "$input" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) active=true ;; esac
echo "$(date +%s) active=$active mode=${PRW_MODE:-always}" >> "${PRW_LOG:-/dev/null}"
# fail-safe: helper absent -> never block
[ -n "${PRW_HELPER:-}" ] && [ -e "$PRW_HELPER" ] || exit 0
[ -n "${PRW_FLAG:-}" ] && [ -s "$PRW_FLAG" ] || exit 0
if [ "${PRW_MODE:-always}" = once ] && [ "$active" = true ]; then exit 0; fi
reason="$(tr -d '\r\n"\' < "$PRW_FLAG")"
printf '{"decision":"block","reason":"%s"}\n' "$reason"
