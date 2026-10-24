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

## Kiro: project-scope install and default agent are not built or verifiable

Kiro currently installs only to the user's home directory (`~/.kiro/`), and nothing in the adapter sets a default or primary agent. A project-scope install (an install-CLI option that writes a harness's files into the project instead of the home directory) does not exist for any harness yet; it is a deferred follow-up. A cloud session's primary agent is selected by `agent` in `.claude/settings.json` for Claude Code only (README, "Primary agent"). It is unverified whether Kiro has a project-level install location beyond `.kiro/settings/` conventions or any native "default agent" mechanism, and we cannot run Kiro in this environment.

**Impact on the Kiro adapter** (`lib/harnesses/kiro.js`): `kiro.js` keeps home-directory-only behavior until someone can verify its project paths and default-agent support against a real Kiro install. Kiro users cannot yet have a project-committed agent set or a cloud-style primary agent. This joins the `fileMatch` gap above and the tool-map entries with no confirmed Kiro equivalent (see §5.02) as known, accepted Kiro gaps rather than something the Claude path can prove out.

## A missing primary agent falls back silently

`agent: engineer` in `.claude/settings.json` only works if the agent is installed before Claude Code launches. The SessionStart hook (`scripts/session-start.sh`) installs bundles after the main agent is resolved, so in a fresh cloud session the engineer is missing and the harness falls back to the default agent without an error. The default agent keeps its own tool set, so the engineer's restrictions (no web tools, spawn limits) do not apply until a second session.

**Mitigation:** run `aif install -B engineering -H claude` at the end of the environment's Setup script (README, "Primary agent"). Nothing detects the fallback; a session that does not behave like the engineer is the only signal.
