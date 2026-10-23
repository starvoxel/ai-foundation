---
name: 'pr-stewardship'
version: '1.0.0'
description: 'Drives an open pull request to a green, mergeable state — checking merge conflicts, CI, and review feedback on each pass, and fixing or reporting what blocks it.'
---

## Purpose

Takes one pass over an open PR and acts: resolves a merge conflict, fixes red CI, answers review comments, or reports the specific blocker. It does one check-and-act pass per invocation and never loops or sleeps.

## Inputs

- **PR number or URL** and the **repository** (owner/name) if not implied by the git remote
- **GitHub access** — always through `ai-git`, never raw `gh`/`git` or GitHub MCP tools. Locally `ai-git gh-*` subcommands work. In a Claude Code cloud session use `ai-git gh-api`; its proxy blocks GraphQL, so `gh pr …` (every `ai-git gh-pr-*`) and `gh repo view` fail with 403. Use repository-scoped REST paths only (`repos/{owner}/{repo}/…`):

| Need                                         | Call                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Mergeable state                              | `ai-git gh-api repos/{owner}/{repo}/pulls/{n}` (`mergeable`, `mergeable_state`)                      |
| CI status                                    | `ai-git gh-api repos/{owner}/{repo}/commits/{head_sha}/check-runs`                                   |
| Review comments                              | `ai-git gh-api repos/{owner}/{repo}/pulls/{n}/comments` (also `.../reviews`, `issues/{n}/comments`)  |
| Create a PR                                  | `ai-git gh-api repos/{owner}/{repo}/pulls --method POST -f title=… -f head=… -f base=main -f body=…` |
| Post a comment                               | `ai-git gh-api repos/{owner}/{repo}/issues/{n}/comments --method POST …`                             |
| Review threads, auto-merge, ready-for-review | The proxy's `ccr/…` routes (its 403 message lists them), not GraphQL                                 |

GitHub-side actions in cloud carry the proxy's identity, not the `ai-git` token's.

## Steps

### Step 1 — Subscribe, then act on each wake

After opening a PR, subscribe to its activity with the `pr_follow_through` tools so CI results, reviews, and conflicts wake the session. Run one pass of Steps 2–4 on each event. Without those tools, whoever invoked this skill decides when to re-run it.

### Step 2 — Merge state

If the PR is not cleanly mergeable, merge the base branch in (a merge commit is always safe) and regenerate lockfiles or generated files with the repo's own tooling, never by hand. Never rebase, amend, or force-push a pushed commit. Run the repo's checks, then push. If both sides changed the same logic so that either choice loses behavior, stop and report instead of guessing.

### Step 3 — CI

If any check on the head commit is red:

1. Rule out a failure that is not this PR's: it reproduces on an unmodified rerun, or the base is red too. For a known base failure with an available fix, port that fix and push.
2. Otherwise root-cause and fix it when it is in code this PR touches or breaks.
3. Never skip, disable, or quarantine a test, and never push an empty commit or close and reopen the PR to force a rerun.
4. If you cannot fix it, post one comment on the PR saying what fails, why, and what you need.

### Step 4 — Review feedback

Implement and push small, unambiguous asks and resolve those threads. For larger or ambiguous asks (a design change, a multi-file refactor), reply with your assessment instead of guessing.

### Step 5 — Report

If the PR is green and mergeable there is nothing to report. Otherwise say what you pushed or what is blocking, and whether the PR is done, needs another pass, or is blocked.

## Outputs

- A pushed fix, a PR comment for something you cannot resolve, and a status: done, needs another pass, or blocked

## Edge Cases

- **`ai-git` is unavailable or has no token** — stop and report; there is no other access path
- **CI is still running** — report pending, not failed
- **Green and waiting only on a human reviewer** — say so once and do not nudge
- **A suspected flaky failure** — rerun once; a second failure is real
- **The PR was opened by someone else** — it is still drivable the same way
