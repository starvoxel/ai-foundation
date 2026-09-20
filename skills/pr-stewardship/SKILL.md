---
name: 'pr-stewardship'
version: '0.1.0'
description: 'Drives an open pull request to a green, mergeable state — checking CI, merge conflicts, and review feedback, and fixing or reporting what blocks it.'
---

## Purpose

Checks an open pull request's CI status, merge state, and review feedback in one pass, and acts: fixes failing CI, resolves a merge conflict, responds to review comments, or reports the specific blocker to the human. Poll-based, not subscription-based — it works the same way whether the invoking agent has `gh` CLI access or only a GitHub MCP server's tools, and whether it runs as a short-lived local dispatch or a long-running cloud session.

This skill does one check-and-act pass per invocation; it does not loop or sleep. Whoever dispatches it (a human, an orchestration skill, a scheduled re-check) decides how often to re-invoke it until the PR is done.

## Inputs

- **PR number or URL** — which pull request to check
- **Repository** — owner/name, if not already implied by the working directory's git remote
- **GitHub access method** — `ai-git gh-*` (wraps `gh`, injecting the token from `.aiconfig.json`) if `gh` is installed, otherwise the installed GitHub MCP server's tools. Either is acceptable; use whichever is available. If `blocked_commands` forbids raw `git`/`gh`, route through `ai-git` — never call them directly.

## Steps

### Step 1 — Check mergeable state

Read the PR's mergeable state (`ai-git gh-pr-view <n> --json mergeable,mergeStateStatus`, or the MCP tool's equivalent PR-detail read). If it is not cleanly mergeable:

1. Merge the base branch into the PR branch. Regenerate lockfiles or other generated files with the repo's own tooling — never by hand.
2. Never rewrite history on a branch you did not create (no rebase, amend, or force-push — a merge commit is always safe). On a branch you created yourself, follow `steering/engineering/git-workflow-projects.md`'s branching convention instead.
3. Run the repo's own validation/tests locally, then push.
4. If both sides changed the same logic such that picking either loses behavior, stop and report to the human instead of guessing.

### Step 2 — Check CI status

Read the check-run/status results for the PR's current head commit. If any are red:

1. Rule out a failure that isn't this PR's: the same error reproduces on an unmodified rerun, or the same check is already red on the base branch.
2. If it is a pre-existing base failure with a known fix (a revert, or a fix already merged or available elsewhere), port that fix into this PR and push.
3. Otherwise, root-cause and fix it directly when the failure is in code this PR touches or breaks.
4. Never skip, disable, or quarantine a test to reach green, and never push an empty commit or close/reopen the PR to force a re-run.
5. If you cannot fix it, post one comment on the PR stating exactly what is failing, why, and what you need — do not leave it silently red.

### Step 3 — Check review feedback

Read open review threads and comments.

1. Implement and push small, unambiguous asks (a nit, a rename, an added test).
2. For larger or ambiguous asks (a design change, a multi-file refactor), reply with your assessment rather than guessing at an implementation.
3. Resolve the threads you addressed.

### Step 4 — Report status

If nothing needed fixing and the PR is green and mergeable, there is nothing further to do or report. Otherwise, summarize what changed (a pushed fix) or what is blocking (a comment already posted per Steps 2–3) so the caller knows whether the PR is done or needs another pass.

## Outputs

- **A pushed fix**, if Steps 1–3 found something to fix
- **A PR comment**, if something is blocking that this skill cannot resolve on its own
- **A status** (done / needs another pass / blocked) returned to whoever invoked this skill

## Edge Cases

- **Neither `gh`/`ai-git` nor a GitHub MCP server is available** — stop and report to the human; this skill cannot proceed without some form of GitHub read/write access.
- **CI is still running** — not a failure; report "pending" and let the caller decide when to re-check.
- **Everything is green, only waiting on a human reviewer's approval** — say so once; do not re-push or nudge repeatedly.
- **Suspected flaky failure** — re-run once if the access method supports it; a second failure is treated as real, not a flake.
- **The PR was opened by a different agent or session** — still driveable the same way; nothing in this procedure assumes the invoker created the PR.
