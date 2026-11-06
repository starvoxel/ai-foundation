# Plan: Fast, repo-owned cloud environment setup

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-06 |

## Goal

Make a Claude Code cloud environment provision quickly and reproducibly. The AIF-005 spikes showed a checksum-verified `bws` release binary installs in 777 ms against 232.8 s for `cargo install bws`, but the finding only reached README prose that a human pastes by hand, and the live environment still has the cargo-built `bws`. Move the Setup script into the repo where it is tested and linked from the README, and remove cloud machinery that committed project-scope installs have made redundant.

## Scope

- In: a committed, tested `scripts/cloud-setup.sh` (pinned, sha256-verified `gh` and `bws` binaries; `ai-foundation` installed from head); a short bootstrap in the README that replaces the pasted recipe; removal of the `AIF_BUNDLES` global-install path from both SessionStart scripts, tests and docs; removal of the superseded AIF-005 archive; arc42 and README updates; a human-run verification of the cache-bust path (spike test D3).
- Out: release versions, tags or a built artifact for ai-foundation (a separate discussion); caching dev dependencies in the environment (the gain is about 4–6 s per session, not worth the stale-`node_modules` risk, so `npm ci` stays in the SessionStart hook); changing the primary-agent mechanism (already a committed project-scope install); non-Linux or non-x86_64 images.

## Approach

- **Bootstrap, one fetch.** The Setup script runs as root before the repo is cloned, so it cannot read `scripts/`. The pasted text is two lines: `npm install -g github:starvoxel/ai-foundation --ignore-scripts` (the same GitHub path spike B proved works on the Trusted network level, and `package.json` has no `files` field so `scripts/` ships), then `bash "$(npm root -g)/ai-foundation/scripts/cloud-setup.sh"`. It tracks head, as decided by the human; the trust boundary is the same as the existing `npm install -g` and no extra unverified `curl | bash` is added. The README states plainly that head means the environment gets whatever `main` holds when the cache is built (rebuilt on any script edit or after about seven days).
- **`scripts/cloud-setup.sh`.** Pinned versions and sha256 values for `gh` and `bws` live in this one file; the README links to it instead of copying it ("Link, Don't Copy"). Idempotent, because the environment build and the first session can run it concurrently (spike B, session 2): it skips a tool already at the pinned version, writes via a temp file then `install`, and always exits 0 after logging, never leaving a half-installed binary. A checksum mismatch skips that tool with an error line. It falls back to `python3 -m zipfile` when `unzip` is missing (spike A2). `bws` is installed to `/usr/local/bin`, which precedes `/root/.cargo/bin` on PATH, so the cargo copy no longer wins.
- **Testable shape.** Version-skip and checksum decisions stay in small shell functions; `tests/integration/cloud-setup.test.js` runs the script with stubbed `curl`, `sha256sum`, `npm` and `install` on a hermetic PATH, the same pattern as `tests/integration/session-start.test.js`.
- **Cache-bust.** Any edit to the pasted text rebuilds the cache; since the pasted text is now constant, the README documents a trailing `# rev: N` comment a human bumps to force a rebuild without a ref change (plan AIF-005 item 13). Because the script body lives at head, editing it in the repo does not bust the cache; the README says so.
- **Cleanup from project-scope install.** The agent and the bundles a project needs are committed with `aif install --scope project`, which applies from turn 1; a global install by the SessionStart hook applies only from the next session. So the `AIF_BUNDLES` environment variable and the hook step `aif install -B $AIF_BUNDLES -H claude --skip-project` are removed from `scripts/session-start.sh` and `projects/_template/scripts/session-start.sh`, with their tests and the README, arc42 05.05, 06 and 11 text. `--skip-project` stays a CLI flag for local use. The superseded `docs/research/cloud-setup-spikes.parts/` archive (a never-approved plan, spike log and throwaway scripts) is deleted, git history keeps it; `cloud-setup-spikes.md` stays, loses links to it, and points at `scripts/cloud-setup.sh` as the implementation.
- Architecture: 06 Runtime View, 11 Risks, 05.05 Command Layer and 05.04 Document Indexing are re-read against the changed files; any section still accurate is waived with an `Arch-Unaffected:` commit line.

## Milestones

### 1. Committed Setup script with tests

- Does: add `scripts/cloud-setup.sh` and `tests/integration/cloud-setup.test.js`.
- Acceptance criteria: with matching checksums both binaries land in the install dir; a tool at the pinned version is not re-downloaded; a checksum mismatch installs nothing for that tool and still exits 0 with an error line; a missing `unzip` uses the Python fallback; a second run changes nothing; no secret is echoed.
- Verified by: the new integration test; `npm run lint`, `format:check`, `typecheck`; `shellcheck` if available.

### 2. README bootstrap and cache-bust docs

- Does: replace the README Setup-script block with the two-line bootstrap and a link to `scripts/cloud-setup.sh`; document head semantics, the `# rev: N` bust, and the human verification checklist; drop `AIF_BUNDLES` from the environment-variable table.
- Acceptance criteria: the README contains no copy of pinned versions or checksums; every command in the bootstrap matches what the integration test exercises.
- Verified by: reread against the script; `npm run validate`; `aif index architecture --check`.

### 3. Remove redundant cloud machinery

- Does: delete the `AIF_BUNDLES` step from both SessionStart scripts, update `tests/integration/session-start.test.js` and the template's tests, delete `docs/research/cloud-setup-spikes.parts/` and fix the links that point to it, update arc42 05.04, 05.05, 06 and 11.
- Acceptance criteria: neither SessionStart script references `AIF_BUNDLES`; `grep -r AIF_BUNDLES` finds only deliberate mentions in a short migration note; no dangling links to the deleted archive; `aif init` output still passes its tests.
- Verified by: full `npm test`; `npm run validate`; the link check in the validation tests.

### 4. Independent review, PR, handover

- Does: run the independent reviewer, fix blocking findings, open the PR, drive it to green, and hand the human the exact environment changes below.
- Acceptance criteria: reviewer approves; required CI green.
- Verified by: review report and CI.

## Human actions (told to the human once the PR is merged)

1. In the environment's Setup script, replace the pasted recipe with the new bootstrap from the README. Unsetting `AIF_BUNDLES` is optional; it is ignored after this change.
2. Start a fresh session and run the README verification checklist; confirm `command -v bws` is `/usr/local/bin/bws` at version 2.1.0.
3. Spike test D3: bump the `# rev: N` comment, start a new session, and confirm the Setup script ran again. Record the result in `docs/research/cloud-setup-spikes.md` (the agent does this edit once told the result).

## Requirements

- Security: the script runs as root, so every downloaded binary is verified against a hardcoded sha256 before install and a mismatch installs nothing; `npm install` uses `--ignore-scripts`; `ai-foundation` at head is unpinned, a deliberate human decision that makes the environment trust `main` of this repo, called out in the README; no token or `BWS_ACCESS_TOKEN` appears in the script or its log.
- Logging: the script prints one line per step to stdout with the tool, version, and outcome (installed, skipped at version, checksum mismatch, failed) and a final summary; failures go to stderr; it always exits 0 so session start never fails, per the spikes.

## Open questions

- None blocking. Assumption to confirm: removing `AIF_BUNDLES` is acceptable because any needed bundle can be committed at project scope. If you want to keep it for consumer repos that cannot commit `.claude/`, say so before approving and Milestone 3 drops that part.
