# Plan: Version ship bot

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-25 |

## Goal

Parallel PRs pick colliding or leapfrogging `package.json` versions because each guesses against a moving `main`. Replace the per-PR bump with a bot: a human comments `/ship` on a green PR, and the bot assigns the version against current `main`, commits it, and merges in one pass. No CI reruns on the version commit. Research: `docs/research/version-numbering-parallel-prs.md` and `-followup.md`.

## Scope

- In: `bump:patch|minor|major` PR labels; `/ship` comment workflow; pure decision logic and an API-only I/O wrapper; a changed version check; GitHub App and ruleset setup (human steps, documented); amending the two steering rules this breaks; 05_07 arc42 update.
- Out: changing `release.yml` (it tags the merge push as today); Dependabot PRs (exempt, unchanged); a merge queue; semver tooling such as Changesets.

## Approach

**Flow.** `issue_comment` workflow runs from the default branch, so PR code never controls it.

1. Parse the comment: exactly `/ship`, nothing else.
2. Authorize: commenter is a human (not a bot, not the AI identity) with write permission. Else log and reply with the reason.
3. Gate: PR is open, non-draft, same-repo, targets `main`, mergeable, not Dependabot, has exactly one `bump:*` label if it changes shipped paths, and **every required check is green on the exact head SHA**. A stacked PR is refused until it is retargeted to `main`.
4. Inside the `ship` concurrency group (`cancel-in-progress: false`): re-read `main`, compute `next = main's version + level`, re-read the head SHA and abort if it moved.
5. Commit only the version fields of `package.json` and `package-lock.json` through the Git Data API, never checking out PR code. Verify the commit's diff touches nothing else.
6. Merge with the API `sha` set to the new head and the repo's existing merge-commit method. The merge push triggers `main` CI and `release.yml`, which tags `v<next>` unchanged.
7. Comment the audit line: who, level, old and new version, gated head SHA, checks seen.

**Why bypass is acceptable here.** The version commit changes no code, and the bot refuses unless the gate passed on the parent. The ruleset names the App as the only bypass actor ("pull requests" mode); no human or agent gets bypass. Required checks still gate everything else.

**Design for testability.** `ship-logic.mjs` is pure: command parsing, authorization decision, gate evaluation, version math, diff verification. `ship.mjs` is a thin API wrapper. Same split as `version-bump-logic.mjs` / `check-version-bumps.mjs`.

**Version check.** `check-version-bumps.mjs` stops requiring a hand bump; it requires a `bump:*` label when shipped paths change, and fails a PR that edits the version fields (the bot owns them). Affected docs: `docs/architecture/05_07_ci_actions_and_release.md`.

**Rule amendments** (in `steering/engineering/git-workflow.md`, human-approved by this plan): "Land Work Through a Branch and PR" and "Required CI Checks Gate Main — Never Bypass Them" each get one named exception for the ship bot, with its gate. The `.claude/rules/` copies are regenerated, not edited by hand.

## Milestones

### 1. Pure logic and tests

- Does: `ship-logic.mjs` with unit tests (parse, authorize, gate, version math incl. pre-1.0 handling, diff verifier).
- Acceptance criteria: every refusal path (bot commenter, no write permission, red or pending check, stale head, missing or duplicate label, stacked PR, extra files in the diff) returns a distinct reason; version math matches the label table.
- Verified by: `npm run test:unit`.

### 2. Rule and doc amendments

- Does: the two steering exceptions, 05_07 update, `skill/pr-stewardship` note that agents never post `/ship`.
- Acceptance criteria: exceptions name the bot and the gate; `aif index architecture --check` clean; regenerated rules match.
- Verified by: `npm test`, review.

### 3. Dry-run workflow and version check

- Does: `ship.yml` + `ship.mjs` in dry-run (comments what it would do, pushes and merges nothing); label-based version check; human documents the GitHub App setup (permissions: contents, pull requests, checks read; private key as a secret).
- Acceptance criteria: on a test PR, `/ship` posts the computed version and gate result; a non-writer's comment is refused.
- Verified by: a throwaway PR, `npm run test:integration`.

### 4. Live merge and ruleset bypass

- Does: enable push and merge; human adds the App as the sole bypass actor.
- Acceptance criteria: a test PR ends merged with one version commit; `release.yml` tags the version; a moved head aborts; two PRs shipped back to back get distinct versions.
- Verified by: throwaway PRs, then the first real PR watched.

## Requirements

- Security: the workflow runs from `main` and never checks out or executes PR code; comment text reaches scripts only through environment variables and an exact match; actions pinned by SHA; the App key is a secret, with least-privilege permissions; the bypass is the App only. Humans only may trigger it; an agent never merges.
- Logging: every decision (allow or refuse, with the reason code) goes to the job summary and a PR comment; the merge audit line names commenter, versions, head SHA and checks.

## Open questions

- Pre-1.0: does a `bump:major` label map to a minor bump, or is `bump:breaking` a separate label? (human)
- The App's own check runs: if a required check is an Actions job, does the ruleset accept bypass-merge of a head with a bot commit and no check results? Test in milestone 3; the research could not confirm it.
- Transition: in-flight PRs with hand bumps (#219, #222) are exempted by label or rebased onto the bot flow? (human)
- Does a failed concurrency run drop a pending `/ship`? The research could not confirm; test in milestone 4.
