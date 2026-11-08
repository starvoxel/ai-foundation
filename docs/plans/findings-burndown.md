# Plan: Findings burn-down

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-08 |

## Goal

Open `finding` issues are only read when the engineer happens to touch a listed file, so findings on untouched files are never fixed. Give the engineer a mode, triggered by the human ("work down findings"), that picks a small batch of open findings and fixes them in one PR.

## Scope

- In: a `batch` subcommand in `skills/findings/scripts/findings.js`; a new "Burn down a batch" step in `skill/findings`; a short engineer prompt line pointing to it; unit tests; the arc42 section 05.06 update; version bumps the repo's check requires.
- Out: triage (closing, re-rating, deduplicating findings), which becomes a separate `findings-triage` skill later; a scheduled backlog report in morning-check; a new agent or a new skill for burn-down.

## Approach

- `batch` is pure selection over the issues `findings.js` already loads, so there is no new network call. Pure `planBatch(map, { maxM, maxS })` returns the batch; the CLI only prints it.
- Selection: effort L findings are never selected. Pick up to 5 M findings (`--max-m`), severity first (critical → low), then oldest issue number first. Then add S findings that fall in the same areas as the picked M findings, again severity first, up to 15 S (`--max-s`). An S finding is in the same area when it shares a file or a parent directory with a picked finding. When no M finding is open, take up to 15 S findings, severity first, and keep those that share areas together. A finding with no `effort:` line counts as M.
- Findings that share a file are never split across batches: a cluster (connected by shared `files:`) is taken whole or not at all, and a cluster larger than the caps is taken only when it is the first selected.
- Defaults are the caps above; both are overridable on the command line and by the human's request.
- Output: one line per finding in the existing `formatLine` format, a blank line between clusters, and a final `Fixes #a, Fixes #b` line to paste into the PR.
- `skill/findings` gains Step 4, "Burn down a batch": run `batch`, implement under the usual standards, put each `Fixes #n` in the PR, and for a finding that proves wrong or not worth fixing comment on it and leave it open for triage. Then the normal flow applies unchanged: oversight sizing, tests, independent review, PR.
- `agents/engineer.yaml` gets one process line: when asked to work down findings, start with `skill/findings` Step 4 ("Burn down a batch") instead of a feature request. No new agent tools or skills.
- Architecture docs affected: 05.06 (`findings.js` row and the Findings description). Re-read against the change and edited.

## Milestones

### 1. `batch` selection and CLI

- Does: `planBatch` plus the `batch` subcommand with `--max-m`, `--max-s`, `--from-file` and `--repo`.
- Acceptance criteria: given a fixture set, L findings are never selected; at most `maxM` M findings are picked severity first; S findings are added only in the same areas as picked findings, capped at `maxS`; an S-only backlog fills up to `maxS`; a missing effort counts as M; findings sharing a file are never split; no findings gives empty output and exit 0; an invalid `--max-m` or `--max-s` exits 1 with a message.
- Verified by: unit tests in `tests/unit/findings.test.js`, `npm run test:unit`.

### 2. Skill, agent prompt, docs

- Does: Step 4 in `skills/findings/SKILL.md`; the engineer prompt line; section 05.06 update; version bumps for `skill/findings` and `engineer`.
- Acceptance criteria: `aif validate` passes; the skill cites its own steps by name; the version-bump check passes; the arch index check passes.
- Verified by: `aif validate`, `npm test`, `aif index architecture --check`, independent review.

## Requirements

- Security: read-only against GitHub through the existing `ai-git gh-api` path; no new token handling, no new dependency, finding text is printed verbatim as data and never executed.
- Logging: errors keep the script's existing `✗ message` stderr form and exit code 1; there is no new log output on the success path beyond the batch lines.

## Open questions

- Resolved by you: 5 M findings plus up to 15 S in the same areas, no L, severity-first within each effort class.
- Assumed, correct me if wrong: "same areas" means a shared file or parent directory; a finding with no effort counts as M.
