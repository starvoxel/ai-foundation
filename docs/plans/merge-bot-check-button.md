# Plan: Merge button on the PR's checks

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by |            |
| Created     | 2026-11-27 |

## Goal

Add a second way to start a merge: a **Merge** button on a check run the bot posts on each PR. Clicking it makes GitHub send a `check_run` event with `requested_action`; the bot reads who clicked from the event's `sender`, verifies they have write access, runs the existing merge gate and merge, and comments who triggered it. `/merge` keeps working unchanged ([merge-bot.md](merge-bot.md)).

## Scope

- In: a check run named `Merge` upserted on a PR's head after its CI finishes; the click handler; one shared pipeline for both entry points; a `Triggered by` line in the comment for a click; the workflow, action and installed template wiring; docs; the Folio update.
- Out: removing `/merge`; a hosted webhook server; buttons on drafts or non-default-branch PRs; more buttons (re-run, update branch).

## What GitHub gives us (to verify, not assume)

- A check run created by a GitHub App through the Checks API can carry up to three `actions` (label, description, identifier). Clicking one sends a `check_run` event, action `requested_action`, with `sender` and `requested_action.identifier`. Check runs made with the job's `GITHUB_TOKEN` belong to the Actions app, so they must be made with the bot's **App token**, which needs the **Checks: Read and write** permission (today it has read). A human step: change the permission and accept it on each installation.
- Believed, unverified: a workflow can trigger on `on: check_run: types: [requested_action]`, from the default branch like the other triggers, so no server is needed; GitHub does not start workflows for check runs created by GitHub Actions, which is another reason to use the App token. Milestone 1 proves this before anything is built on it.
- Unknown until tried: where the button shows (the check run's own page is certain; the PR's merge box is not), and who GitHub lets click it. The handler verifies write access itself either way.

## Approach

**One pipeline.** `merge.mjs` already takes a requester and a PR and runs authorize, gather, decide, queue or merge. The click becomes a second entry with `source: 'button'`; everything after authorization is shared. A click while checks are still running queues exactly as `/merge` does.

**The click handler** reads only these event fields, each validated before use: `sender.login` and `sender.type` (a bot never merges), `requested_action.identifier` (must be the bot's one identifier), `check_run.id`, `check_run.head_sha` (40 hex), `check_run.app` (must be the bot's own App: a button from any other App is ignored). It finds the open PR for the head through the API, refuses a PR whose head is no longer `head_sha` (a stale button must not merge a newer commit the human never saw), checks `collaborators/{sender}/permission`, then the same gate.

**Who is told.** A click has no comment of its own, so the bot's reply says who: `Triggered by @login` after the result lines, on success, wait and failure. A `/merge` reply is unchanged, since the comment above it already names the person.

**Posting the button.** After a pull-request CI run finishes (the existing `workflow_run` wake-up), the bot reads the run's `head_sha` (validated as 40 hex, the one payload field it now reads), finds the open PR, and upserts a `Merge` check run on that head: conclusion `neutral` (never required, never blocks), a summary of what a merge would do right now (the gate's reasons or the version it would assign), and the button. Live mode only; a dry run posts nothing. The bot's own `[skip ci]` commits move the head, so the button of the old head is simply stale and refused.

**Security.** The workflow runs from the default branch and reads no PR code. Event fields reach the script through environment variables only. The click is trusted only for a check run of the bot's own App, a human sender with write access, and an unchanged head. No agent can click: GitHub creates the event from a person's UI action, which is a stronger guard than the steering rule that covers `/merge`.

## Milestones

### 1. Spike: prove the trigger and the button

- Does: a throwaway workflow in a test repository creates a check run with one action using the App token, and a second workflow triggers on `check_run: requested_action` and logs `sender`. No merge code.
- Acceptance criteria: the click starts a workflow run from the default branch with the clicker's login in the payload; the check run's `app` identifies the bot's App; we know where the button appears and whether a read-only user can click.
- Verified by: a click by the human, the run's log. The human first sets the App's Checks permission to read and write. If the trigger does not exist, stop and report: the alternative is a hosted webhook, which is out of scope.

### 2. Pure logic

- Does: in `merge-logic.mjs`, the check-run payload builder (name, neutral conclusion, summary from the decision, the action), the event validator (identifier, head SHA shape, sender, app), and the `Triggered by` line for the success, waiting and failure templates.
- Acceptance criteria: every invalid event (wrong identifier, bad SHA, bot sender, other App) returns a distinct reason; `/merge` comments are byte-for-byte unchanged.
- Verified by: unit tests.

### 3. The click and the button in `merge.mjs`

- Does: the `check_run` entry (`EVENT_NAME=check_run`), the upsert after CI, shared pipeline, stale-head refusal.
- Acceptance criteria: a click by a writer merges (or queues, or refuses with reasons) exactly as `/merge` would; a click by a non-writer, a stale head, another App's button, or a bot does nothing but log; the upsert creates then updates one check run per head, and never posts in a dry run.
- Verified by: unit tests with the fake API, including both event shapes.

### 4. Wiring, docs, Folio

- Does: `merge.yml`, the `merge` action and the installed `aif-merge.yml` template gain the `check_run` trigger; arc42 05.07, the README setup (the App's Checks permission), and the steering exception text for the merge bot mention the button. After release, re-run `aif install -I merge` in Folio, since workflow files are never rewritten by a bare update.
- Acceptance criteria: in AIF and Folio a click merges a PR; `/merge` still works; the Folio template and AIF's own workflow agree.
- Verified by: a throwaway PR in each repository, then `npm test`.

## Requirements

- Security: as above. Actions pinned by SHA; the App key stays a secret; least privilege (the job token keeps `checks: read`, the App gets `checks: write`).
- Logging: every click is logged with the sender, the check run id and the outcome (merged, queued, refused with the reason, ignored with why).

## Decisions to confirm

- **Trigger by Actions, not a server**, subject to milestone 1.
- **The button appears after CI finishes**, on open, non-draft, same-repository PRs that target the default branch, live mode only. Clicking earlier is not possible; `/merge` still waits for running checks.
- **Reply wording:** `Triggered by @login`. The mention notifies the person who clicked, which is harmless; say if it should be the bare login.
- **Version:** a new capability, so a minor bump when it ships (label chosen from the version policy, confirmed with the human).

## Open questions

- Does the PR page show the button, or only the check run's page? Milestone 1.
- Can a user with only read access click it? Milestone 1; the handler checks write access regardless.
