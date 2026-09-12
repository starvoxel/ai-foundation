# Decision Record: Install CLI Redesign

## Metadata

| Field          | Value            |
| -------------- | ---------------- |
| Decision ID    | AIF-ARCH-001     |
| Project        | ai-foundation    |
| Status         | Approved         |
| Author (Agent) | Architect        |
| Approved By    | Jeremy           |
| Created        | 2026-07-31 21:08 |
| Referenced By  | AIF-ARCH-002     |

> **Note:** This decision predates the AIF-META-001 Tier × Domain model (approved
> 2026-08-14) and has not been reformatted to the current template. Its content
> and Approved status remain valid as historical record.

---

## Problem Statement

The existing `install.ps1` is Windows/PowerShell-only, uses symlinks, assumes agents are `.md` files for Kiro (incorrect — Kiro expects `.json`), and has no structured way to install subsets of components. We need a portable, OS-agnostic install system that correctly transforms components for each target harness.

## Constraints & Requirements

What was non-negotiable:

- Must be OS-agnostic (runs on Windows, macOS, Linux — testable via Git Bash)
- Must support multiple harnesses with different file format expectations
- Must be able to install/uninstall cleanly with manifest tracking
- Source of truth for agents remains YAML in this repo
- Must make skills discoverable to generic agents (not just agents that know about ai-foundation)

What was a preference but not a hard requirement:

- Minimal dependencies (Node.js stdlib + `yaml` package already in use)
- Single CLI entry point rather than knowing individual script files
- Keep it simple — no over-engineering for v1

---

## Options Explored

### Option A: Shell script (.sh) with symlinks

**Summary**: Rewrite install.ps1 as a bash script, keep the symlink approach, fix the target format.
**Strengths**: Simple, no build step, works in Git Bash.
**Weaknesses**: Symlinks require admin on Windows; can't handle transforms (YAML → JSON); limited logic for resolving bundles and domains.
**Verdict**: Not chosen — too limited for the transform requirements and bundle resolution logic needed.

### Option B: Node.js CLI with copies and per-harness adapters

**Summary**: A `bin/cli.js` entry point backed by a `lib/` folder with command modules, harness-specific adapters, bundle resolution, and manifest tracking. All installs are copies (transformed where needed). Bundles define what to install by domain auto-discovery plus explicit overrides.
**Strengths**: Portable (Node.js everywhere); can handle complex transforms; single CLI interface; bundles provide flexible scoping; manifest enables clean uninstall and update detection.
**Weaknesses**: More code to write and maintain than a simple script; requires Node.js runtime.
**Verdict**: Chosen — the transform requirement (YAML → JSON for Kiro) and bundle resolution logic demand a real programming language, and Node.js is already a dependency.

### Option C: Node.js CLI with symlinks for some, copies for others

**Summary**: Same as B but symlink steering/skills (which don't need transforms) and only copy agents (which do).
**Strengths**: Auto-updating for non-transformed files.
**Weaknesses**: Mixed model is confusing; admin required for symlinks on Windows; if we ever need to transform steering or skills for a harness, the symlink approach breaks; inconsistent uninstall behavior.
**Verdict**: Not chosen — mixed model adds complexity for minimal gain. Copies everywhere is simpler and consistent.

---

## Decision

**Chosen approach**: Option B — Node.js CLI with copies and per-harness adapters

**Rationale**:
Every harness has different expectations for file format and location. Kiro wants JSON agents, markdown steering, and MCP configs in specific directories. Future harnesses (Copilot, Claude Code) will have their own formats. A copy-based approach with transform adapters handles all of these uniformly. The manifest provides clean lifecycle management.

**Trade-offs accepted**:

- Files can go stale after source updates (mitigated by `aif status` showing hash mismatches and easy `aif install` re-run)
- Slightly more disk usage than symlinks (negligible for text files)
- Requires running `aif install` after pulling changes (acceptable given the transform requirement)

---

## Design

### CLI Entry Point

`bin/cli.js` — registered in `package.json` as `"aif"`.

```bash
aif install --bundle <name> --harness <name>
aif uninstall --bundle <name> --harness <name>
aif status
aif list bundles|agents|skills|servers
# Future:
aif validate
```

CLI parsing via `process.argv` — no external library.

### Directory Structure

```
ai-foundation/
├── bin/
│   └── cli.js                ← Entry point
├── lib/
│   ├── commands/
│   │   ├── install.js        ← install & uninstall logic
│   │   ├── status.js         ← read manifest, report state
│   │   └── list.js           ← list bundles/agents/skills/servers
│   ├── harnesses/
│   │   ├── kiro.js           ← Kiro transforms & target paths
│   │   ├── copilot.js        ← Future
│   │   └── claude.js         ← Future
│   ├── constants.js          ← Shared paths, filenames, defaults
│   └── manifest.js           ← Read/write .installs.yaml
├── bundles/
│   └── engineering.yaml
├── .installs.yaml            ← Generated, gitignored
└── package.json
```

### Bundle Schema

```yaml
name: 'engineering'
version: '1.0.0'
description: 'Full engineering domain bundle'

# Auto-discover all components in this domain (optional)
domain: 'engineering'

# Append on top of auto-discovered components (all optional)
agents: []
skills: []
steering: []
servers: []
```

### Bundle Resolution Logic

When `domain` is specified:

1. Find all agents where `agent.domain == bundle.domain`
2. Collect skills from those agents' `skills` fields
3. Include `steering/global/**/*.md` + `steering/{domain}/**/*.md`
4. Parse agent `tools` fields — entries referencing server tools (e.g., `@git/git_status`) resolve to the corresponding server in `servers/`

Then append any explicitly listed `agents`, `skills`, `steering`, `servers` from the bundle file.

Resolver deduplicates the final list. Resolver errors if nothing is specified (no domain and no explicit lists).

### Manifest (`.installs.yaml`)

```yaml
engineering_kiro:
  version: '1.0.0'
  files:
    - path: '~/.kiro/agents/architect.json'
      hash: 'sha256:abc123...'
    - path: '~/.kiro/steering/core.md'
      hash: 'sha256:def456...'
    - path: '~/.kiro/servers/git/server.js'
      hash: 'sha256:789abc...'
```

Key format: `{bundleName}_{harness}`

Used for:

- **Uninstall**: iterate files, delete each, remove manifest entry
- **Update detection**: compare source file hash to stored hash
- **Status reporting**: show what's installed, flag stale files

### Kiro Harness Adapter

| Component | Source                       | Target                                                                                    | Transform                                                    |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Agent     | `agents/{name}.yaml`         | `~/.kiro/agents/{name}.json`                                                              | YAML → Kiro JSON (map prompt, tools, skills→resources, etc.) |
| Steering  | `steering/**/*.md`           | `~/.kiro/steering/{name}.md`                                                              | Copy as-is                                                   |
| Skills    | `skills/{name}/SKILL.md`     | `~/.kiro/skills/{name}/SKILL.md`                                                          | Copy as-is                                                   |
| Servers   | `servers/{name}/{name}.yaml` | `~/.kiro/servers/{name}/` (files) + merge into `~/.kiro/settings/mcp.json` (registration) | YAML → Kiro MCP JSON entry; copy server scripts/executables  |

### Scope

**v1: Global only** — installs to user-wide harness locations.

**Future: Project-scoped** — installs to `.kiro/` in the project directory. Deferred.

---

## Impact on Planning

- The existing `install.ps1` will be deprecated and eventually removed
- `package.json` needs a `bin` field added
- `.gitignore` needs `.installs.yaml` added
- The `tests/install.test.js` will need to be rewritten for the new CLI
- Each harness adapter needs knowledge of the harness's expected formats (validated via introspection of harness docs)

---

## Resolved Items

| #   | Item                                        | Resolution                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Kiro MCP server install location            | MCP settings live at `~/.kiro/settings/mcp.json` (for registration). Local-run server scripts/executables are copied to `~/.kiro/servers/{name}/` so they exist on disk for the MCP config to reference. The installer both copies server files and merges entries into `mcp.json`.                                                      |
| 2   | Define Copilot/Claude Code adapter specs    | Steering scoping resolved in AIF-ARCH-002. Full adapter implementation deferred to v2.                                                                                                                                                                                                                                                   |
| 3   | `aif validate` vs existing `tests/` scripts | Deferred. Will replace them when implemented.                                                                                                                                                                                                                                                                                            |
| 4   | Bundle `domain` field required or optional  | Optional. Each component list (`agents`, `skills`, `steering`, `servers`) is also optional. A bundle with only `domain` is valid. A bundle with only explicit lists is valid. Resolver errors if nothing is specified (no domain and no lists). Resolver deduplicates components across domain-discovered and explicitly-listed entries. |
