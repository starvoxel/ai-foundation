#!/usr/bin/env bash
# Claude Code SessionStart hook: enables this repo's git hooks and builds the arc42 index.
# Every step only warns on failure. Agents and bundles are committed at project scope
# (`aif install --scope project`), not installed here.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0

git config core.hooksPath .githooks || echo "WARNING: could not set core.hooksPath" >&2

if command -v aif >/dev/null 2>&1; then
  aif index architecture || echo "WARNING: aif index architecture failed" >&2
else
  echo "WARNING: aif is not on PATH; skipping index build" >&2
fi
exit 0
