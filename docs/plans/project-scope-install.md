# Plan: Project-scope install

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-10-25 |

## Goal

A session's primary agent must be installed before Claude Code launches, but the SessionStart hook runs after the agent is resolved, and the cached cloud Setup script runs before the clone and can only be refreshed by a human editing it. Installing bundles into the repo itself (`.claude/`, committed) makes the agent exist the moment the clone finishes, and makes "refresh" a commit instead of a cache bust. Spike Tests 1 and 3 (AIF-005) showed committed project agents work from turn 1.

## Scope

- In: `aif install --scope project|global` for Claude and Kiro; a committed project manifest; a portable hook command; a non-failing drift check run in CI; SessionStart skipping bundles already installed at project scope; a `default` bundle flag and an `aif init` flag that installs the default bundles at project scope; committing this repo's `engineering` bundle; README, arc42 and research-brief updates.
- Out: changing which agents exist; Setup-script changes beyond the README (`gh`/`bws` binaries stay as they are); running Kiro itself (not available here).

## Approach

- **Scopes:** `--scope global` (today's behaviour, `~/.claude/`, `~/.kiro/`) stays the default; `--scope project` targets the repo root: `.claude/{agents,rules,skills,standards,scripts}` and `.mcp.json` for Claude, and Kiro's project-level directories (taken from the researcher brief, below). Target roots become a function of scope rather than module constants in each adapter (§5.02).
- **Project manifest:** `.claude/.installs.yaml` (Kiro: its project directory equivalent), committed, with repo-relative paths. It records which bundles are installed at project scope; `.gitignore` gets an exception for it. Global installs keep today's manifest.
- **Portable hook command:** at project scope, `node "$CLAUDE_PROJECT_DIR"/.claude/scripts/block-command/cli.js …` instead of `process.execPath` and a home path. Trade-off: a shell where bare `node` is not on `PATH` fails the hook; documented in the README.
- **Drift check:** `aif install --scope project --check` regenerates in memory, diffs against the committed files and the manifest, prints each drifted path, and exits 0. CI runs it as a warning step.
- **SessionStart:** keeps installing `AIF_BUNDLES` at global scope for extra bundles (for example `ai-engineering`), skipping any bundle listed in the project manifest so nothing loads twice.
- **Default bundles:** bundle YAML gains an optional `default: true` (set on `engineering` now; a future `product` bundle can opt in). `aif init` installs every default bundle at project scope only when a flag is passed (proposed `--with-default-bundles`); without it, init is unchanged.
- **Research:** AIF-005's findings (bws binary vs cargo, Setup-script caching, ref bump, failure behaviour, why Setup-script agent selection was dropped) move into `docs/research/cloud-setup-findings.md`.
- arc42 affected: §5.01 (bundle `default` field), §5.02 (adapter targets, hook command), §5.05 (install and init options), §6 (install runtime, manifest), §11 (Kiro gap narrows to runtime verification).

## Milestones

### 1. Claude project scope

- Does: `--scope project|global` on `install`, `uninstall`, `status` and `--update`; scope-aware Claude targets; project manifest; portable hook command; `.mcp.json` for servers.
- Acceptance criteria: installing `engineering` at project scope into a temp repo writes every component under `.claude/` with no absolute machine paths, writes `.claude/.installs.yaml` with relative paths, and uninstall removes exactly those files; global scope output is unchanged.
- Verified by: unit tests for target resolution and hook-command generation; integration tests for install, update and uninstall in a temp repo; existing tests unchanged and passing.

### 2. Drift check and SessionStart

- Does: `--check`; a warning-only CI step; `session-start.sh` skips `AIF_BUNDLES` entries already in the project manifest.
- Acceptance criteria: editing or deleting a committed file makes `--check` list that path and exit 0; a clean tree reports no drift; SessionStart with an overlapping `AIF_BUNDLES` installs only the non-overlapping bundles and logs the skipped ones.
- Verified by: unit tests for the diff logic; integration test for the drift report; hook script test with overlapping bundles.

### 3. Kiro project scope

- Does: Kiro project targets and manifest, after an `engineering-researcher` brief on Kiro's project-level locations (dispatch confirmed by the human first).
- Acceptance criteria: a project-scope Kiro install writes the layout the brief documents, with relative paths, and uninstalls cleanly.
- Verified by: unit and integration tests on file layout. Runtime behaviour stays unverified and is recorded in arc42 §11.

### 4. Default bundles, adoption and docs

- Does: the `default` bundle field (schema and validation); the `aif init` flag; commit this repo's `engineering` bundle at project scope; README "Primary agent" and cloud sections; arc42 updates; the research brief.
- Acceptance criteria: `aif init` with the flag installs exactly the default bundles at project scope, and without it writes nothing new; this repo's committed `.claude/` passes `--check`; docs describe the Setup script as binaries-only and the agent as committed.
- Verified by: unit tests for default-bundle selection; integration test for init with and without the flag; `aif validate`; full `npm test`; a local headless `claude` canary if the CLI is available. A first-turn check in a fresh cloud session waits until a test environment exists.

## Requirements

- Security: committed files contain no secrets and no absolute machine paths; the committed hook script is executable code, reviewed like any other change; install never writes outside the chosen scope's root.
- Logging: install, uninstall and check log the scope, target root and each written, removed or drifted path; SessionStart logs the bundles it skipped and why.

## Open questions

- Name of the `aif init` flag (`--with-default-bundles` proposed): human.
- Whether `generic` is a default bundle (assumed not; it carries the gmail server): human.
- Precedence when the same agent exists at global and project scope (expected: project wins); verified locally during Milestone 1 where possible, else documented as unverified: agent.
