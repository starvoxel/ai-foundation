# Plan: Override the primary agent from the cloud Setup script

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-07 |

## Goal

A checkout of this repo (or of a project made from the template) always starts as the `engineer` agent, from the committed `"agent": "engineer"` in `.claude/settings.json`. In a cloud environment, a human must be able to choose a different agent by editing the environment's Setup script, without committing anything. Probes in a real cloud environment (2026-11-07) proved a route: `.claude/settings.local.json` written into the checkout before Claude Code starts overrides the committed agent from the first turn.

## Scope

- In: an optional `AIF_AGENT` setting in the pasted Setup script, read by `scripts/cloud-setup.sh`, which writes the override into every repo under `/home/user`, installs a re-creating `post-checkout` hook, and sets a system git template for repos cloned later; a gitignore rule for `.claude/settings.local.json` in this repo and the project template; tests; README, arc42 and research-doc updates.
- Out: overriding by environment variable (the Setup script cannot read the environment's variables, per the environment docs and the probe); managed settings (ignored in cloud, tested); a wrapper around the `claude` binary; changing the committed default; installing agents (the named agent must already exist at project scope, user scope, or as a built-in).

## Approach

Findings the design rests on (tested locally on Claude Code 2.1.319, and in a real cloud environment by probe):

| Fact                                                                                                                   | Consequence                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A project `agent` setting beats a user-level one                                                                       | `~/.claude/settings.json` cannot override the committed agent                  |
| Managed settings are ignored when the host attests the machine policy folder absent, which is the case in cloud        | `/etc/claude-code` cannot override it                                          |
| `.claude/settings.local.json`, `--agent` and `--settings` all beat the committed `agent`                               | Only the local settings file is reachable from a Setup script                  |
| The Setup script cannot read the environment's variables                                                               | The agent name is a line in the pasted Setup text, not an environment variable |
| The repo is already present under `/home/user` when the Setup script runs, and the written file takes effect on turn 1 | The script writes the file straight into the existing clone                    |

- **Setting.** The pasted Setup text gains an optional `export AIF_AGENT=<name>` line before it runs `scripts/cloud-setup.sh`. Unset or empty: nothing is written and the checkout starts as the committed agent.
- **Validation (security).** The name must match `^[a-z0-9][a-z0-9_-]{0,63}$` before anything is written, so it can never inject into JSON, a path or a shell. An invalid name is logged to stderr and ignored; the script still exits 0. A missing `.claude/agents/<name>.md` in a repo only logs a warning, since the agent may be user-level or built-in.
- **Layers, for the repos that exist and the ones that do not yet.** (1) For each directory under `/home/user` with a `.git`, write `.claude/settings.local.json` as `{"agent":"<name>"}` unless one already exists (never overwrite; log it). (2) Install `.git/hooks/post-checkout` that rewrites the file if it is missing, unless a hook is already there; it is best-effort, because a repo that sets `core.hooksPath` (this one does, to `.githooks`) bypasses `.git/hooks`. (3) Set `git config --system init.templateDir` to a template carrying the same hook, for repos cloned after setup. The hook and the agent name live under `/usr/local/share/aif/`.
- **Idempotent and cache-safe.** Re-running changes nothing. Removing the `AIF_AGENT` line and rebuilding starts from a clean image (spike D1), so the override disappears; the script does not try to delete files it cannot prove it wrote.
- **Testability.** `CLOUD_SETUP_REPOS` (default `/home/user/*/`), `CLOUD_SETUP_SHARE_DIR` and `GIT_CONFIG_SYSTEM` are test seams, like `CLOUD_SETUP_BIN_DIR`. Name validation is a small pure shell function.
- Architecture: arc42 §11 ("A missing primary agent falls back silently") gains the override and its limits; §06 is re-read and waived with `Arch-Unaffected` if still accurate.

## Milestones

### 1. Override in `scripts/cloud-setup.sh`, with tests

- Does: add the `AIF_AGENT` handling described above.
- Acceptance criteria: unset writes nothing and creates no hook or template; a valid name writes `{"agent":"<name>"}` into each stub repo and not into a non-repo directory; an existing `settings.local.json` or `post-checkout` is left alone and logged; each of `../x`, `a b`, `$(id)`, an empty-after-trim name and a 65-character name is rejected with no write and exit 0; a second run changes nothing; a real `git clone` with the template writes the file; deleting the file then checking out a branch recreates it; the existing gh/bws behaviour is unchanged.
- Verified by: extended `tests/integration/cloud-setup.test.js` (real `git`, scratch repos); a mutation check that dropping the validation fails a test; lint, format, typecheck.

### 2. Gitignore and docs

- Does: ignore `.claude/settings.local.json` in `.gitignore` and `projects/_template/.gitignore`; update the README ("Setup script", "Primary agent") with the `export AIF_AGENT=` line, the precedence facts and the limits; add the new findings to `docs/research/cloud-setup-spikes.md`; update arc42 §11.
- Acceptance criteria: the file is ignored in both places; the README states what the setting does, that it needs a Setup-script edit and rebuild, and that an agent which does not exist falls back to the default; no pinned values or script text copied.
- Verified by: `git check-ignore`; `npm run validate`; `aif index architecture --check`; a test that the template ignores the file.

### 3. Independent review, PR, handover

- Does: reviewer pass, fix blocking findings, open the PR, drive it to green.
- Acceptance criteria: reviewer approves; required CI green.
- Verified by: review report and CI.

## Human actions (told to the human once the PR is merged)

1. In the environment's Setup script, add `export AIF_AGENT=<name>` above the `cloud-setup.sh` line and bump `# rev:`.
2. Start a fresh session and confirm it runs as that agent and `.claude/settings.local.json` exists.
3. To go back to the default, delete the line, bump `# rev:`, and confirm the session starts as `engineer`.

## Requirements

- Security: the agent name is validated against a strict pattern before any write and is never evaluated by a shell; writes happen only inside repos found under `/home/user` and the script's own share directory; symlinked `.claude` paths are not followed; no secret is read or logged.
- Logging: one stdout line per repo and per action (written, already present and left alone, hook installed or skipped, template set); invalid names and unwritable repos go to stderr; the script still always exits 0.

## Open questions

- None blocking. Assumptions: a missing agent file is a warning, not an error; an existing `settings.local.json` is never merged or overwritten. Say if either should differ.
