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

- `batch` is pure selection over the issues `findings.js` already loads, so there is no new network call. Pure `planBatch(map, { max, maxSimple, includeLarge })` returns the batch; the CLI only prints it.
- Selection has two groups. The main group (`--max`, default 5) is filled with M findings or smaller, so S findings can take its slots; effort L is excluded unless `--include-large` is passed, which makes L eligible for the main group too. Then extra S findings in the same areas as the picked findings are added up to `--max-simple` (default 15), which is a separate allowance, so a backlog of only S findings yields up to 20. An S finding is in the same area when it shares a file or a parent directory with a picked finding. A finding with no `effort:` line counts as M.
- Ordering, for choosing within each group and for the printed output: severity first (critical → low), regardless of size, then size (L, M, S), then oldest issue number first. Severity only decides order among findings that are in the batch; it never pulls in a finding the groups above exclude.
- Findings that share a file are never split across batches: a cluster (connected by shared `files:`) is taken whole or not at all, and a cluster larger than the caps is taken only when it is the first selected.
- Defaults are the caps above; both are overridable on the command line and by the human's request.
- Output: one line per finding in the existing `formatLine` format, a blank line between clusters, and a final `Fixes #a, Fixes #b` line to paste into the PR.
- `skill/findings` gains Step 4, "Burn down a batch": run `batch`, implement under the usual standards, put each `Fixes #n` in the PR, and for a finding that proves wrong or not worth fixing comment on it and leave it open for triage. Then the normal flow applies unchanged: oversight sizing, tests, independent review, PR.
- `agents/engineer.yaml` gets one process line: when asked to work down findings, start with `skill/findings` Step 4 ("Burn down a batch") instead of a feature request. No new agent tools or skills.
- Architecture docs affected: 05.06 (`findings.js` row and the Findings description). Re-read against the change and edited.

## Milestones

### 1. `batch` selection and CLI

- Does: `planBatch` plus the `batch` subcommand with `--max`, `--max-simple`, `--include-large`, `--from-file` and `--repo`.
- Acceptance criteria: given a fixture set, L findings are selected only with `--include-large` (then they are eligible for the main group); the main group takes at most `max` findings of size M or smaller, ordered severity, then size, then age; extra S findings are added only in the same areas as picked findings, capped at `maxSimple`; an S-only backlog yields up to `max` plus `maxSimple`; the printed order is severity, then size, then age; a missing effort counts as M; findings sharing a file are never split; no findings gives empty output and exit 0; an invalid `--max` or `--max-simple` exits 1 with a message.
- Verified by: unit tests in `tests/unit/findings.test.js`, `npm run test:unit`.

### 2. Skill, agent prompt, docs

- Does: Step 4 in `skills/findings/SKILL.md`; the engineer prompt line; section 05.06 update; version bumps for `skill/findings` and `engineer`.
- Acceptance criteria: `aif validate` passes; the skill cites its own steps by name; the version-bump check passes; the arch index check passes.
- Verified by: `aif validate`, `npm test`, `aif index architecture --check`, independent review.

## Requirements

- Security: read-only against GitHub through the existing `ai-git gh-api` path; no new token handling, no new dependency, finding text is printed verbatim as data and never executed.
- Logging: errors keep the script's existing `✗ message` stderr form and exit code 1; there is no new log output on the success path beyond the batch lines.

## Open questions

- Resolved by you: main group of 5 filled by M or smaller, plus up to 15 extra S in the same areas, no L unless asked; order is severity, then size, then age.
- Assumed, correct me if wrong: the flag is named `--include-large`; "same areas" means a shared file or parent directory; a finding with no effort counts as M; "size" orders larger first (L, M, S) within a severity; "if there are only A open" meant S.
