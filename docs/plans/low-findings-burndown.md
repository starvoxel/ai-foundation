# Plan: Burn down open low findings

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-24 |

## Goal

Clear the 20 open `low` findings (#122–#203) in three reviewable PRs, so they stop reappearing in every burn-down.

## Scope

- In: all 20 open `low` findings, split into three PRs; closing the findings that need no code change.
- Out: any change not described by a finding.

## Approach

Decisions agreed with the human:

| #                            | Decision                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 122                          | Document that `project_standards` must be a literal; add a test. No inline resolver (avoids copying `aif config`) |
| 123                          | Remove only Hard rules that loaded steering already states; keep engineer-specific ones                           |
| 125                          | Add `gh-api` write patterns: `-X POST`, `--method` before the endpoint, bare `-f`                                 |
| 128                          | Move `installContext`/`withScope`/`installBundle` to a shared module; pass a `quiet` flag                         |
| 129                          | Kiro HTTP installer records a hash per entry, matching `--check`                                                  |
| 130                          | Adapters report skipped vs failed separately; failed servers stay in the bundle entry (own PR)                    |
| 144                          | Close as won't-fix: template stays identical to the repo copy                                                     |
| 145                          | Test asserting the template script equals `.github/scripts/cleanup-branches.mjs`                                  |
| 173                          | Sweep stale `ai-git-sign-*` dirs on start                                                                         |
| 177                          | `rm -f` the temp file when `mv` fails                                                                             |
| 193                          | Cluster first, then defer clusters containing an ineligible L finding                                             |
| 178                          | Add a "superseded by cloud-setup-fast-start" note to the brief                                                    |
| 200                          | Validated: same-file back-reference, no component named, `aif validate refs` does not flag it. Close              |
| 203                          | Close as won't-fix; pushed commits are never rewritten                                                            |
| 168, 176, 182, 185, 186, 189 | Add the tests each finding describes                                                                              |

## Milestones

### 1. Tests and test strength (PR 1)

- Does: #145, #168, #176, #182, #185, #186, #189.
- Acceptance criteria: each named branch or risk has a test that fails without the behaviour it covers.
- Verified by: `npm test`; independent review.

### 2. Scripts, agents and docs (PR 2)

- Does: #122, #123, #125, #128, #129, #173, #177, #193, #178; closes #144, #200, #203 with a comment.
- Acceptance criteria: each finding's described fix is in; `aif validate` and `aif index architecture --check` pass.
- Verified by: `npm test`, `aif validate`; independent review.

### 3. Adapter skipped/failed contract (PR 3)

- Does: #130.
- Acceptance criteria: a server that failed (definition not found, no protocol) stays in its bundle entry and is retried at global scope; deliberate skips do not.
- Verified by: unit and integration tests for each adapter; independent review.

## Requirements

- Security: #173 must keep the temp key 0600 in a 0700 dir; the sweep only removes `ai-git-sign-*` dirs it owns.
- Logging: no logging requirement applies beyond existing behaviour.

## Open questions

- None.
