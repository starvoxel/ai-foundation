#!/usr/bin/env bash
# AIF-012 Task 004 (W4/F2) - THROWAWAY SPIKE. asyncRewake probe: wait, then exit 2 with stderr text.
# Env: PRW_DELAY seconds (default 20), PRW_EXIT exit code (default 2), PRW_LOG.
echo "$(date +%s) rewake start" >> "${PRW_LOG:-/dev/null}"
sleep "${PRW_DELAY:-20}"
echo "$(date +%s) rewake firing" >> "${PRW_LOG:-/dev/null}"
echo "REWAKE-PROBE: fake PR changed (secret token: PINEAPPLE-7731)" >&2
exit "${PRW_EXIT:-2}"
