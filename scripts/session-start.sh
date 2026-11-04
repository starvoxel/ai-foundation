#!/usr/bin/env bash
# Cloud SessionStart hook (Plan AIF-008, Task 004).
#
# Runs only in Claude Code cloud sessions. Its only network step is
# `npm ci --ignore-scripts`: this repo's lockfile-pinned dependencies, dev
# included so a session can run the full CI locally (lint, prettier, tsc, tests;
# fails on lockfile drift); `npm link` alone does not provide them, so `aif`
# would fail on its first import. A project's own scaffolded SessionStart hook
# should install production dependencies only (--omit=dev). Then it puts ai-git and aif on PATH
# with `npm link --ignore-scripts`, installs the bundles named in AIF_BUNDLES,
# and runs `ai-git doctor` to report (never fix) whether ai-git, gh, bws and the
# token resolve. gh and bws come from the environment's Setup script (see
# README, "Claude Code Cloud"). It also enables the repo's .githooks and builds the arc42 index. Every step warns on failure and the hook still exits 0.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

project_dir="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$project_dir" ]; then
  project_dir="$(git rev-parse --show-toplevel 2>/dev/null)" || project_dir=""
fi
if [ -z "$project_dir" ] || ! cd "$project_dir" 2>/dev/null; then
  echo "WARNING: cannot enter the project directory (CLAUDE_PROJECT_DIR='${CLAUDE_PROJECT_DIR:-}'); skipping session start" >&2
  exit 0
fi

npm ci --ignore-scripts --no-audit --no-fund \
  || echo "WARNING: npm ci failed; aif may be missing dependencies" >&2

npm link --ignore-scripts \
  || echo "WARNING: npm link failed; ai-git and aif may not be on PATH" >&2

# Hooks (and their index refresh) aren't active in a fresh clone: `npm ci` above skips
# `prepare`, so point git at .githooks and build the gitignored arc42 index once now.
git config core.hooksPath .githooks \
  || echo "WARNING: could not set core.hooksPath" >&2
node bin/aif.js index architecture \
  || echo "WARNING: aif index architecture failed" >&2

if [ -n "${AIF_BUNDLES:-}" ]; then
  node bin/aif.js install -B "$AIF_BUNDLES" -H claude --skip-project \
    || echo "WARNING: aif install failed for AIF_BUNDLES=$AIF_BUNDLES" >&2
fi

ai-git doctor \
  || echo "WARNING: ai-git doctor reported problems (see output above)" >&2
