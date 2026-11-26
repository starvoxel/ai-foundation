# Plan: Merge bot as a project integration

| Field       | Value                             |
| ----------- | --------------------------------- |
| Status      | Done                              |
| Approved by | jeremysmellie@gmail.com (in chat) |
| Created     | 2026-11-25                        |

## Goal

The `/merge` bot ([merge-bot.md](merge-bot.md)) runs only in ai-foundation, from scripts in that repo. Folio and any later project should get it the way they get the other integrations: `aif install -I merge`, a pinned caller workflow, Dependabot-owned pins ([05.08](../architecture/05_08_project_integrations.md)). Then add it to Folio.

## Scope

- In: a composite action `.github/actions/merge` that runs the bot's scripts from the pinned ai-foundation checkout; the bot's version handling made opt-in so a project without versioned releases gets the gate, the branch update, the wait for checks and the merge; a `merge` integration (`aif-merge.yml` template) in the registry, in `all` and in `aif init`; docs; then the Folio PR.
- Out: a `merge-method` option (Folio uses merge commits, as ai-foundation does); moving ai-foundation's own `merge.yml` onto the action; squash merges; creating the GitHub App or editing Folio's rulesets (human steps, documented).

## Decisions

- **Action, not copied scripts.** The caller workflow holds only triggers, permissions, concurrency and one `uses: starvoxel/ai-foundation/.github/actions/merge@<sha> # vX.Y.Z` step. The scripts then run from the pinned release, and Dependabot bumps it like the `checks` pin. No script is copied into a project, so none can drift.
- **Version handling is opt-in.** A new input `version-paths` (comma-separated directories) says which changes need a `bump:*` label and a version commit. Empty, the default, means none: no label is required, no version is read or written, and `version-hand-edited` is not checked. ai-foundation's own `merge.yml` passes its list explicitly. Folio has no versioned releases (`0.0.0`, no tags), so it installs with the default.
- **Same gate everywhere.** Required checks are read from the branch's rules, so Folio's three rulesets (Static checks, Unit tests, Integration tests, End-to-end tests) are all enforced. A check not started yet, such as End-to-end tests behind the others, counts as waiting while another is running (already built).
- **Live switch per repository.** The `MERGE_BOT_LIVE` variable, `MERGE_APP_CLIENT_ID` and the `MERGE_APP_PRIVATE_KEY` secret are set in each repository, as in ai-foundation. Until `MERGE_BOT_LIVE` is `true` the bot only comments what it would do.
- **The trigger workflow name is `CI`.** `workflow_run` takes a literal, so the template names `CI`; a project with another name edits the file, which then reports as modified locally, never overwritten.
- **Release first.** The pin is the latest release tag in the checkout, so the action must be released (it is, by the bot's merge) before Folio installs the integration.

## Milestones

### 1. Version handling opt-in

- Does: `merge-logic.mjs` and `merge.mjs` take the version-bearing directories as input (`VERSION_PATHS`, required: a missing setting is an error, so it is never read as "no versions"); empty disables labels, version reads and writes, and the hand-edit check. ai-foundation's `merge.yml` sets its current list.
- Acceptance criteria: with an empty list a PR touching any file needs no label, produces no version commit and no `Version bumped` line, and merges after the gate; with ai-foundation's list every existing behaviour is unchanged.
- Verified by: unit tests for both modes; `merge.yml`'s validation test pins the explicit list.

### 2. The `merge` action

- Does: `.github/actions/merge/action.yml` and README, inputs `live`, `app-client-id`, `app-private-key`, `version-paths`. It creates the App token when live (SHA-pinned `create-github-app-token`), passes event data as environment variables only, and runs `merge.mjs` from its own checkout (`github.action_path`). No project checkout is needed.
- Acceptance criteria: nothing from the event reaches a shell inline; the token is created only when live; actions are pinned by SHA.
- Verified by: a validation test like `merge-workflow.test.js`, then the first live run in Folio.

### 3. The `merge` integration

- Does: `lib/integrations/assets/aif-merge.yml`, a registry entry (pinned, with the dependabot snippet), `all` expansion, `aif init`, `05.08` and README updated, tests.
- Acceptance criteria: `aif install -I merge` writes one pinned workflow, a second run changes nothing, a Dependabot pin bump is not an edit, `-I all` and `aif init` include it.
- Verified by: unit and integration tests, `npm test`.

### 4. Folio

- Does: after the release, `aif install -I merge` in Folio, one PR there. Human steps, documented in the AIF README and listed in the PR: install the GitHub App on Folio, set the variable and secret, add the App as a bypass actor of Folio's three CI rulesets (and `Basic` if it blocks the merge), set `MERGE_BOT_LIVE`.
- Acceptance criteria: in Folio, a dry-run `/merge` comments what it would do; live, a PR with CI running waits and then merges; a red check refuses.
- Verified by: a throwaway Folio PR, then the first real one. The first Folio merge (this PR) is by hand.

## Requirements

- Security: the workflow runs from the pinned action, never PR code; comment text and PR data reach scripts only through environment variables and exact matching; the App key is a repository secret with least-privilege permissions; the bypass is the App only. A Dependabot bump of the pin is a reviewed PR, since the action holds the App key.
- Logging: unchanged from [merge-bot.md](merge-bot.md): every decision goes to the job log and a PR comment.

## Open questions

- Whether `github.action_path` keeps the scripts' relative imports intact on a runner: confirmed by the first real runs in Folio (2026-11-26).

## Outcome

Shipped in AIF v0.8.0 and v0.8.1 and installed in Folio (PR 72). In Folio the bot waited for the full CI chain on a throwaway PR (73) and merged it with a bare `Merge successful`, since Folio has no versioned releases. v0.8.1 fixed the template, which had a quoted empty `version-paths` that a project's Prettier rewrote.
