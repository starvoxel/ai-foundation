---
section: '11'
title: 'Risks and Technical Debt'
lifecycle: published
tags: [risks]
key_files:
  - lib/harnesses/kiro.js
  - .claude/settings.json
  - scripts/session-start.sh
---

> Known gaps and reliability risks this project accepts rather than solves, and why.

## Kiro `fileMatch` steering is unreliable

Kiro's `inclusion: "fileMatch"` mode is documented as conditionally loading a
steering file only when the agent reads a file matching a glob pattern, but as of
the last check the actual matching-pattern frontmatter field is undocumented by
Kiro, and community reports ([kirodotdev/Kiro#6171](https://github.com/kirodotdev/Kiro/issues/6171),
closed as duplicate) say `fileMatch` files are never injected into context
regardless of matching files — for both global and workspace-level steering.

**Impact on the Kiro adapter** (`lib/harnesses/kiro.js`): a populated
`file_patterns` still emits `inclusion: "fileMatch"` with the pattern — optimistic,
not a silent downgrade to always-load or a skipped install. If Kiro fixes the
feature, conditional steering starts working automatically with no adapter change.
If not, the file simply never loads, which is acceptable because conditional
steering is an optimization, not a correctness requirement — anything with rules an
agent must always see uses `file_patterns: []` (always load) regardless of harness.

## Kiro: project-scope paths and default agent are unverified

`aif install --scope project -H kiro` writes `.kiro/{agents,steering,skills,standards}` and `.kiro/settings/mcp.json` in the project. Those locations, and that they outrank `~/.kiro`, come from search summaries and a community mirror of Kiro's docs, not from Kiro's own site or a running Kiro (`docs/research/project-scope-harness-locations.md`); Kiro also loads workspace agents only in a trusted workspace. Nothing in the adapter sets a default or primary agent for Kiro, and we cannot run Kiro in this environment.

**Impact on the Kiro adapter** (`lib/harnesses/kiro.js`): a project-scope Kiro install has the expected file layout (integration tests) but its runtime behavior is unconfirmed. This joins the `fileMatch` gap above and the tool-map entries with no confirmed Kiro equivalent (see §5.02) as known, accepted Kiro gaps.

## Project-scope Claude install: unverified runtime details

- **Hook path.** Claude Code's docs do not say `CLAUDE_PROJECT_DIR` is set for hooks in agent frontmatter, and two issues report it empty. The committed hook falls back to `git rev-parse --show-toplevel`; outside a git work tree with the variable unset, the hook fails to start and Claude Code treats that as a non-blocking error, so the blocked command runs.
- **Skill precedence.** A personal skill (`~/.claude/skills`) outranks a project skill of the same name, so a stale global install silently shadows the committed one. SessionStart passes `--skip-project`, but a global install made by hand is not prevented.
- **Trust.** Agent-frontmatter hooks and project MCP servers apply only after the folder is trusted in an interactive session.
- **Stdio server first start.** A committed stdio server installs its dependencies when Claude Code first starts it. With no network, or an install slower than the 30-second connect timeout (seen locally: about 4s for the MCP SDK, 9s with `googleapis`), the server is unavailable for that session; the next start retries unless the install completed. Two sessions starting at once share one install through a lock; a start still waiting after 25 seconds fails that session's connection. A launcher killed during the install leaves npm running and a lock that the next start takes over after two minutes. A launcher killed with SIGKILL leaves the server running until its stdin closes. Transitive dependency versions float, since server folders have no lockfile.

## A missing primary agent falls back silently

`agent: engineer` in `.claude/settings.json` only works if the agent is installed before Claude Code launches. The SessionStart hook (`scripts/session-start.sh`) installs bundles after the main agent is resolved, so if the agent is not already present the harness falls back to the default agent without an error. The default agent keeps its own tool set, so the engineer's restrictions (no web tools, spawn limits) do not apply.

**Mitigation:** commit a project-scope install (`aif install --scope project -B engineering -H claude`), so the agent arrives with the clone (README, "Primary agent"). Nothing detects the fallback when it is missing; a session that does not behave like the engineer is the only signal.
