# Plan: Merge bot

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-25 |

## Goal

Parallel PRs pick colliding or leapfrogging `package.json` versions because each guesses against a moving `main`. Replace the per-PR bump with a merge process: a human comments `/merge` on a PR, and a bot analyzes its setup, assigns the version against current `main`, commits it, and merges in one pass. No CI reruns on the version commit. The bot only merges; it never tags or releases, which stays with `release.yml`. Research: `docs/research/version-numbering-parallel-prs.md` and `-followup.md`.

## Scope

- In: `bump:patch|minor|breaking` PR labels; `/merge` comment workflow; pure decision logic and an API-only I/O wrapper; a changed version check; GitHub App and ruleset setup (human steps, documented); amending the two steering rules this breaks; 05_07 arc42 update.
- Out: tagging or releasing by the bot; changing `release.yml` (it tags the merge push as today); Dependabot PRs (exempt, unchanged); a merge queue; semver tooling such as Changesets.

## Approach

**Flow.** `issue_comment` workflow runs from the default branch, so PR code never controls it.

1. Parse the comment: exactly `/merge`, nothing else.
2. Authorize: commenter is a human (not a bot, not the AI identity) with write permission. Else log and reply with the reason.
3. Gate: PR is open, non-draft, same-repo, targets `main`, mergeable, not Dependabot, has exactly one `bump:*` label (`breaking` bumps the minor while below 1.0, the major from 1.0) if it changes shipped content paths, and **every required check is green on the exact head SHA**. A stacked PR is refused until it is retargeted to `main`.
4. Inside the `merge` concurrency group (`cancel-in-progress: false`): re-read `main`, compute `next = main's version + level`, re-read the head SHA and abort if it moved.
5. Commit only the version fields of `package.json` and `package-lock.json` through the Git Data API, never checking out PR code. Verify the commit's diff touches nothing else.
6. Merge with the API `sha` set to the new head and the repo's existing merge-commit method. The merge push triggers `main` CI and `release.yml`, which tags `v<next>` unchanged.
7. Comment the audit line: who, level, old and new version, gated head SHA, checks seen.

**Why bypass is acceptable here.** The version commit changes no code, and the bot refuses unless the gate passed on the parent. The ruleset names the App as the only bypass actor ("pull requests" mode); no human or agent gets bypass. Required checks still gate everything else.

**Design for testability.** `merge-logic.mjs` is pure: command parsing, authorization decision, gate evaluation, version math, diff verification. `merge.mjs` is a thin API wrapper. Same split as `version-bump-logic.mjs` / `check-version-bumps.mjs`.

**Version check.** `check-version-bumps.mjs` stops requiring a hand bump; it requires a `bump:*` label when shipped content paths change, and fails a PR that edits the version fields (the bot owns them). Affected docs: `docs/architecture/05_07_ci_actions_and_release.md`.

**Rule amendments** (in `steering/engineering/git-workflow.md`, human-approved by this plan): "Land Work Through a Branch and PR" and "Required CI Checks Gate Main — Never Bypass Them" each get one named exception for the merge bot, with its gate. The `.claude/rules/` copies are regenerated, not edited by hand.

## Milestones

### 1. Pure logic and tests

- Does: `merge-logic.mjs` with unit tests (parse, authorize, gate, version math incl. `breaking` below and from 1.0, diff verifier).
- Acceptance criteria: every refusal path (bot commenter, no write permission, red or pending check, stale head, missing or duplicate label, stacked PR, extra files in the diff) returns a distinct reason; version math matches the label table.
- Verified by: `npm run test:unit`.

### 2. Rule and doc amendments

- Does: the two steering exceptions, 05_07 update, `skill/pr-stewardship` note that agents never post `/merge`.
- Acceptance criteria: exceptions name the bot and the gate; `aif index architecture --check` clean; regenerated rules match.
- Verified by: `npm test`, review.

### 3. Dry-run workflow and version check

- Does: `merge.yml` + `merge.mjs` in dry-run (comments what it would do, pushes and merges nothing); label-based version check; strip hand bumps from the open PRs and label them; human documents the GitHub App setup (permissions: contents, pull requests, checks read; private key as a secret).
- Acceptance criteria: on a test PR, `/merge` posts the computed version and gate result; a non-writer's comment is refused.
- Verified by: a throwaway PR, `npm run test:integration`.

### 4. Live merge and ruleset bypass

- Does: enable push and merge; human adds the App as the sole bypass actor.
- Acceptance criteria: a test PR ends merged with one version commit; `release.yml` tags the version; a moved head aborts; two PRs merged back to back get distinct versions.
- Verified by: throwaway PRs, then the first real PR watched.

## Requirements

- Security: the workflow runs from `main` and never checks out or executes PR code; comment text reaches scripts only through environment variables and an exact match; actions pinned by SHA; the App key is a secret, with least-privilege permissions; the bypass is the App only. Humans only may trigger it; an agent never merges.
- Logging: every decision (allow or refuse, with the reason code) goes to the job summary and a PR comment; the merge audit line names commenter, versions, head SHA and checks.

## Decisions

- Labels are `bump:patch|minor|breaking`; `breaking` bumps the minor below 1.0 (human, 2026-11-25).
- Transition: open PRs with hand bumps (#218, #219, #221, #222) have them stripped and get a `bump:*` label, then go through `/merge`; no dual-mode check (human, 2026-11-25).

## Open questions

- The App's own check runs: if a required check is an Actions job, does the ruleset accept bypass-merge of a head with a bot commit and no check results? Test in milestone 3; the research could not confirm it.
- Does a failed concurrency run drop a pending `/merge`? The research could not confirm; test in milestone 4.
