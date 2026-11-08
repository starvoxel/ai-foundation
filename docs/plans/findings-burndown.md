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

- `batch` is pure selection over the issues `findings.js` already loads, so there is no new network call. Pure `planBatch(map, { limit, maxEffort })` returns the batch; the CLI only prints it.
- Ranking: severity first (critical → low), then effort ascending (S, M, L, unset last). Findings that share a file are clustered (connected components over `files:`) and a cluster is taken whole, so one file is not revisited across PRs. Clusters are added in the rank of their best finding until `limit` issues is reached; a cluster that alone exceeds `limit` is taken only when it is the first.
- Defaults: `limit` 5 issues, `maxEffort` M (L findings are skipped unless `--max-effort L` is given). Both are overridable on the command line and by the human's request.
- Output: one line per finding in the existing `formatLine` format, a blank line between clusters, and a final `Fixes #a, Fixes #b` line to paste into the PR.
- `skill/findings` gains Step 4, "Burn down a batch": run `batch`, implement under the usual standards, put each `Fixes #n` in the PR, and for a finding that proves wrong or not worth fixing comment on it and leave it open for triage. Then the normal flow applies unchanged: oversight sizing, tests, independent review, PR.
- `agents/engineer.yaml` gets one process line: when asked to work down findings, start with `skill/findings` Step 4 ("Burn down a batch") instead of a feature request. No new agent tools or skills.
- Architecture docs affected: 05.06 (`findings.js` row and the Findings description). Re-read against the change and edited.

## Milestones

### 1. `batch` selection and CLI

- Does: `planBatch` plus the `batch` subcommand with `--limit`, `--max-effort`, `--from-file` and `--repo`.
- Acceptance criteria: given a fixture set, selection is ordered by severity then effort; findings sharing a file land in one cluster and are taken together; `limit` and `maxEffort` are honoured; no findings gives empty output and exit 0; an invalid `--max-effort` or `--limit` exits 1 with a message.
- Verified by: unit tests in `tests/unit/findings.test.js`, `npm run test:unit`.

### 2. Skill, agent prompt, docs

- Does: Step 4 in `skills/findings/SKILL.md`; the engineer prompt line; section 05.06 update; version bumps for `skill/findings` and `engineer`.
- Acceptance criteria: `aif validate` passes; the skill cites its own steps by name; the version-bump check passes; the arch index check passes.
- Verified by: `aif validate`, `npm test`, `aif index architecture --check`, independent review.

## Requirements

- Security: read-only against GitHub through the existing `ai-git gh-api` path; no new token handling, no new dependency, finding text is printed verbatim as data and never executed.
- Logging: errors keep the script's existing `✗ message` stderr form and exit code 1; there is no new log output on the success path beyond the batch lines.

## Open questions

- Is a batch of 5 issues at effort ≤ M the right default?
- Should a batch ever skip severity ordering to prefer cheap wins (for example LOW/S before MEDIUM/M)? The plan proceeds severity-first unless you say otherwise.
