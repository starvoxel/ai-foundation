# Plan: Merge bot

| Field       | Value                             |
| ----------- | --------------------------------- |
| Status      | Approved                          |
| Approved by | jeremysmellie@gmail.com (in chat) |
| Created     | 2026-11-25                        |

## Goal

Parallel PRs pick colliding or leapfrogging `package.json` versions because each guesses against a moving `main`. Replace the per-PR bump with a merge process: a human comments `/merge` on a PR, and a bot analyzes its setup, assigns the version against current `main`, commits it, and merges in one pass. No CI reruns on the version commit. The bot only merges; it never tags or releases, which stays with `release.yml`. Research: `docs/research/version-numbering-parallel-prs.md` and `-followup.md`.

## Scope

- In: `bump:patch|minor|major` PR labels; `/merge` comment workflow; pure decision logic and an API-only I/O wrapper; a changed version check; GitHub App and ruleset setup (human steps, documented); amending the two steering rules this breaks; 05_07 arc42 update.
- Out: tagging or releasing by the bot; changing `release.yml` (it tags the merge push as today); Dependabot PRs (exempt, unchanged); a merge queue; semver tooling such as Changesets.

## Approach

**Flow.** `issue_comment` workflow runs from the default branch, so PR code never controls it.

1. Parse the comment: exactly `/merge`, nothing else.
2. Authorize: commenter is a human (not a `Bot`-type account) with write permission. The bot cannot tell an agent from a human: agents' API calls run as the human's account, so the steering rule alone forbids an agent posting `/merge`. Else log and reply with the reason.
3. Gate: PR is open, non-draft, same-repo, targets `main`, mergeable, not Dependabot, has exactly one `bump:*` label (`major` bumps the minor while below 1.0, the major from 1.0) if it changes shipped content paths, and **every required check is green on the exact head SHA**. A stacked PR is refused until it is retargeted to `main`.
4. Inside the `merge` concurrency group: re-read `main`, compute `next = main's version + level`, re-read the head SHA and abort if it moved.
5. If the head is behind `main`, merge `main` into the PR branch first (the update-branch API; a conflict refuses). Without this, the version commit would conflict with the newer version line another PR already put on `main`. The gate stays tied to the pre-update head.
6. Commit only the version fields of `package.json` and `package-lock.json` through the Git Data API, never checking out PR code. Verify that commit's diff touches nothing else.
7. Merge with the API `sha` set to the new head and the repo's existing merge-commit method. The merge push triggers `main` CI and `release.yml`, which tags `v<next>` unchanged.
8. Comment the audit line: who, level, old and new version, gated head SHA, checks seen.

**Why bypass is acceptable here.** The version commit changes no code, and the bot refuses unless the gate passed on the head it started from. Merging `main` into the branch adds no change beyond what GitHub's own merge commit would produce; the combined head has no CI run before it lands, and `main` CI runs after. The ruleset names the App as the only bypass actor ("pull requests" mode); no human or agent gets bypass. Required checks still gate everything else.

**Design for testability.** `merge-logic.mjs` is pure: command parsing, authorization decision, gate evaluation, version math, diff verification. `merge.mjs` is a thin API wrapper. Same split as `version-bump-logic.mjs` / `check-version-bumps.mjs`.

**Version check.** `check-version-bumps.mjs` stops requiring a hand bump; it requires a `bump:*` label when shipped content paths change, and fails a PR that edits the version fields (the bot owns them). Affected docs: `docs/architecture/05_07_ci_actions_and_release.md`.

**Rule amendments** (in `steering/engineering/git-workflow.md`, human-approved by this plan): "Land Work Through a Branch and PR" and "Required CI Checks Gate Main — Never Bypass Them" each get one named exception for the merge bot, with its gate. The `.claude/rules/` copies are regenerated, not edited by hand.

## Milestones

### 1. Pure logic and tests

- Does: `merge-logic.mjs` with unit tests (parse, authorize, gate, version math incl. `major` below and from 1.0, diff verifier).
- Acceptance criteria: every refusal path (`Bot`-type commenter, no write permission, red or pending check, stale head, missing or duplicate label, stacked PR, extra files in the diff, update-branch conflict) returns a distinct reason; version math matches the label table.
- Verified by: `npm run test:unit`.

### 2. Rule and doc amendments

- Does: the two steering exceptions, 05_07 update, `skill/pr-stewardship` note that agents never post `/merge`.
- Acceptance criteria: exceptions name the bot and the gate; `aif index architecture --check` clean; regenerated rules match.
- Verified by: `npm test`, review.

### 3. Dry-run workflow

- Does: `merge.yml` + `merge.mjs` in dry-run (comments what it would do, pushes and merges nothing); human documents the GitHub App setup (permissions: contents, pull requests, checks read; private key as a secret).
- Acceptance criteria: on a test PR, `/merge` posts the computed version and gate result; a non-writer's comment is refused.
- Verified by: a throwaway PR, `npm run test:integration`.

### 4. Live merge and ruleset bypass

- Does: enable push and merge; switch `check-version-bumps.mjs` to the label-based check; create the `bump:*` labels; strip the hand bumps from the open PRs and label them; human adds the App as the sole bypass actor.
- Acceptance criteria: a test PR ends merged with one version commit; `release.yml` tags the version; a moved head aborts; a PR behind `main` is updated, versioned and merged with no conflict; two PRs merged back to back get distinct versions.
- Verified by: throwaway PRs, then the first real PR watched.

### 5. Wait for checks

- Does: a live `/merge` whose only problem is a running required check adds the `merge-queued` label and a marker comment (requester, head SHA, time) and waits; `merge.yml` also triggers on a finished `pull_request` CI run, lists the labelled PRs, and settles each through the same gate and merge path.
- Acceptance criteria: waits only when a check is running and nothing else is wrong; merges once green; drops the wait after 4 hours, when the head moved, the requester lost write access, the PR closed or the label was removed; a marker not written by a bot is ignored; one PR's failure does not stop the others; dry-run mode never queues; the wake-up reads no event payload.
- Verified by: `npm run test:unit`, `npm run test:validation`, then a real PR commented while CI runs.

## Requirements

- Security: the workflow runs from `main` and never checks out or executes PR code; comment text reaches scripts only through environment variables and an exact match; actions pinned by SHA; the App key is a secret, with least-privilege permissions; the bypass is the App only. Only a human-type account with write access can trigger it; an agent never posts `/merge` (the steering rule, not a check, enforces that).
- Logging: every decision (allow or refuse, with the reason code) goes to the job summary and a PR comment; the merge audit line names commenter, versions, head SHA and checks.

## Decisions

- Labels are `bump:patch|minor|major`; `major` bumps the minor below 1.0 and the major from 1.0 (human, 2026-11-25; replaces an earlier `bump:breaking` label).
- Transition: open PRs with hand bumps (#218, #219, #221, #222) have them stripped and get a `bump:*` label, then go through `/merge`; no dual-mode check (human, 2026-11-25).

- The AI-identity check is dropped: agents' GitHub API calls run as the human's account, so a login list could not catch them. The steering rule and the `pr-stewardship` note forbid agents from posting `/merge` (human, 2026-11-25).
- The label-based version check, the `bump:*` labels and the hand-bump stripping move from milestone 3 to milestone 4, since they can only switch on when the bot is live (human, 2026-11-25).

- A comment starting with `/merge` plus more text gets a fixed "not supported" reply, only from a writer; any commenter whose login contains `[bot]` or whose type is `Bot` is never answered, so the App's own replies cannot trigger a loop (human, 2026-11-25).

- Go-live is one repository variable, `MERGE_BOT_LIVE`: until it is `true` the workflow stays a dry run and CI keeps requiring a hand bump, so merging the code changes nothing and no release is skipped in between (built 2026-11-25).
- CI does not require a `bump:*` label: a label change would re-run all of CI, and the bot already refuses a shipped change without one. CI only forbids a PR editing the version once the bot is live (built 2026-11-25; reverse if a label check in CI is wanted).
- The bot's commits carry `[skip ci]` so no runner time is spent re-testing a version-only commit; `main`'s own CI and `release.yml` still run on the merge (built 2026-11-25; the skip behaviour is unverified until the first live merge).
- The App-token action is `actions/create-github-app-token` v3.3.0, pinned to the SHA in `docs/research/create-github-app-token-pin.md`; the SHA is from a researcher brief and not independently verified (2026-11-25).

- A pending `/merge` waits for checks instead of being refused, for up to 4 hours (human, 2026-11-25). The wait is the label plus a bot-written marker; removing the label cancels it. Wake-ups reuse the `merge` concurrency group, and GitHub keeps only one pending run per group, so a wake-up can replace a `/merge` comment run still pending behind a running merge; comment again if the bot stays silent.

- A PR in a GitHub stack cannot be merged through the usual merge endpoint (403 "Merging stacked PRs via this endpoint is not supported"), so the bot falls back to `PUT /pulls/{n}/merge-async` and polls it. The endpoint's shape comes from user reports, not GitHub's own docs, which the researcher could not read; the first real stacked merge is the test. It failed with "3 of 3 required status checks are expected" until the request also carried `bypass_rules: true` (from a third-party report, itself unconfirmed); the call must ask for the bypass that the ordinary endpoint gives a bypass actor on its own (2026-11-25).

- A retry after a merge that failed part-way is gated on the commit beneath the bot's own `[skip ci]` commits, each verified as the bot's (author, exact message, version-only diff or an update from `main`), so the user need not push a commit to get CI on a head the bot made (human, 2026-11-25).

## Open questions

- The App's own check runs: if a required check is an Actions job, does the ruleset accept bypass-merge of a head with a bot commit and no check results? Test in milestone 3; the research could not confirm it.
- Does a failed concurrency run drop a pending `/merge`? The research could not confirm; test in milestone 4.
