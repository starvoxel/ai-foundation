# Plan: Override the primary agent from the cloud Setup script

| Field       | Value                             |
| ----------- | --------------------------------- |
| Status      | Approved                          |
| Approved by | jeremysmellie@gmail.com (in chat) |
| Created     | 2026-11-07                        |

## Goal

A checkout of this repo (or of a project made from the template) always starts as the `engineer` agent, from the committed `"agent": "engineer"` in `.claude/settings.json`. In a cloud environment, a human must be able to choose a different agent by editing the environment's Setup script, without committing anything. Probes in a real cloud environment (2026-11-07) proved a route: `.claude/settings.local.json` written into the checkout before Claude Code starts overrides the committed agent from the first turn, and persists into later sessions.

## Scope

- In: an optional `AIF_AGENT` setting in the pasted Setup script, read by `scripts/cloud-setup.sh`, which writes the override into every repo already under `/home/user`; a gitignore rule for `.claude/settings.local.json` in this repo and the project template; tests; README, arc42 and research-doc updates.
- Out: overriding by environment variable (the Setup script cannot read the environment's variables, per the environment docs and the probe); managed settings (ignored in cloud, tested); a wrapper around the `claude` binary; a `post-checkout` hook or a git template for repos cloned after setup (neither fired in any probe, and the template changes every `git clone`; revisit only if a real case needs it); changing the committed default; installing agents (the named agent must already exist at project scope, user scope, or as a built-in); repos added to the environment after its snapshot was built.

## Approach

Findings the design rests on (tested locally on Claude Code 2.1.319, and by probe in a real cloud environment):

| Fact                                                                                                                    | Consequence                                                                    |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A project `agent` setting beats a user-level one                                                                        | `~/.claude/settings.json` cannot override the committed agent                  |
| Managed settings are ignored when the host attests the machine policy folder absent, which is the case in cloud         | `/etc/claude-code` cannot override it                                          |
| `.claude/settings.local.json`, `--agent` and `--settings` all beat the committed `agent`                                | Only the local settings file is reachable from a Setup script                  |
| The Setup script cannot read the environment's variables                                                                | The agent name is a line in the pasted Setup text, not an environment variable |
| The repo is already cloned under `/home/user` when the Setup script runs; the written file takes effect on turn 1       | The script writes the file straight into the existing clone                    |
| A later session (7 minutes on) restored the build's snapshot with the file in place and did not re-run the Setup script | The write persists across sessions; no hook or template is needed              |

- **Setting.** The pasted Setup text gains an optional `export AIF_AGENT=<name>` line before it runs `scripts/cloud-setup.sh`. Unset or empty: nothing is written and the checkout starts as the committed agent.
- **Validation (security).** The name must match `^[a-z0-9][a-z0-9_-]{0,63}$` before anything is written, so it can never inject into JSON, a path or a shell. An invalid name is logged to stderr and ignored; the script still exits 0. A missing `.claude/agents/<name>.md` in a repo only logs a warning, since the agent may be user-level or built-in.
- **Write.** For each directory under `/home/user` that has a `.git` (a symlink is skipped), write `.claude/settings.local.json` as `{"agent":"<name>"}` unless one already exists (never overwritten or merged; logged). The file is untracked, so it survives the checkouts a session makes.
- **Idempotent and cache-safe.** Re-running changes nothing. Removing the `AIF_AGENT` line and rebuilding starts from a clean image (spike D1), so the override disappears; the script does not try to delete files it cannot prove it wrote.
- **Testability.** `CLOUD_SETUP_REPOS` (default `/home/user/*/`) is a test seam, like `CLOUD_SETUP_BIN_DIR`. Name validation is a small pure shell function.
- Architecture: arc42 §11 ("A missing primary agent falls back silently") gains the override and its limits; §06 is re-read and waived with `Arch-Unaffected` if still accurate.

## Milestones

### 1. Override in `scripts/cloud-setup.sh`, with tests

- Does: add the `AIF_AGENT` handling described above.
- Acceptance criteria: unset writes nothing; a valid name writes `{"agent":"<name>"}` into each stub repo and not into a non-repo directory; an existing `settings.local.json` is left alone and logged; a symlinked repo or `.claude` is skipped; each of `../x`, `a b`, `$(id)` and a 65-character name is rejected with no write and exit 0; a second run changes nothing; the existing gh/bws behaviour is unchanged.
- Verified by: extended `tests/integration/cloud-setup.test.js` (scratch repos); a mutation check that dropping the validation fails a test; lint, format, typecheck.

### 2. Gitignore and docs

- Does: ignore `.claude/settings.local.json` in `.gitignore` and `projects/_template/.gitignore`; update the README ("Setup script", "Primary agent") with the `export AIF_AGENT=` line, the precedence facts and the limits; add the new findings to `docs/research/cloud-setup-spikes.md`; update arc42 §11.
- Acceptance criteria: the file is ignored in both places; the README states what the setting does, that it needs a Setup-script edit and rebuild, that repos added later are not covered, and that an agent which does not exist falls back to the default; no pinned values or script text copied.
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

- Security: the agent name is validated against a strict pattern before any write and is never evaluated by a shell; writes happen only inside repos found under `/home/user`; no hook or git config is installed; symlinks are not followed; no secret is read or logged.
- Logging: one stdout line per repo and per action (written, already present and left alone, skipped); invalid names and unwritable repos go to stderr; the script still always exits 0.

## Open questions

- None blocking. Assumptions: a missing agent file is a warning, not an error; an existing `settings.local.json` is never merged or overwritten. Say if either should differ.
