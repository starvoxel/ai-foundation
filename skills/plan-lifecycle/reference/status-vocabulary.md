# Status Vocabulary

Single source of truth for the `Status` field values used by every human-approval-gated artifact. Producing skills (chunk-planning, epic-planning, decision-record, ai-engineering-plan) reference this table in their templates rather than defining their own status list.

## Core statuses (all artifact types)

| Status | Meaning | Dependent work allowed? |
|---|---|---|
| `Draft` | Still being written or under revision. Not yet reviewed, or review is in progress. | No |
| `Approved` | Human explicitly confirmed, and that confirmation is committed to git. | Yes — this is the only status that satisfies an approval gate |
| `Done` | The work the artifact describes has been completed. | N/A — informational only |
| `Deferred` | Human explicitly chose to postpone a decision on this artifact, rather than approve or reject it. | No |

`In Progress` is deliberately not a status value. Whether an artifact's work is actively underway is answered by the orchestration state file (`paths.orchestration`), not by the plan's own status field — keeping "is this being worked on right now" in exactly one place avoids two sources of truth drifting out of sync.

## Per-artifact-type extensions

| Artifact Type | Allowed Statuses | Notes |
|---|---|---|
| Chunk Plan | `Draft`, `Approved`, `Done`, `Deferred` | No extension needed |
| Epic Plan | `Draft`, `Approved`, `Done`, `Deferred` | No extension needed |
| Tier 3 `ai-engineering-plan` | `Draft`, `Approved`, `Done`, `Deferred` | No extension needed |
| Decision Record | `Draft`, `Approved`, `Done`, `Deferred`, `Superseded`, `Amending` | `Superseded`: a later decision replaced this one. This is a terminal outcome reached after the record was `Approved`, not a choice made at initial review. `Amending` (Decision Records only): an amendment has been proposed and applied to the record's body, and is awaiting human confirmation. Unlike `Superseded`, this is not a terminal state — it always resolves back to `Approved`, whether the human confirms or rejects the proposal. It blocks dependent work exactly as `Draft`/`Deferred` already do, through the existing positive `Approved` check — no gate anywhere needs to know this value exists. |

*(AIF-002-004)* Tier does not add new `Status` values. A Tier B Decision Record uses the same `Draft`/`Approved`/`Done`/`Deferred`/`Superseded` values as Tier A — only the *procedure* for reaching `Approved` differs (see `skill/plan-lifecycle`/`reference/commit-gate-procedure.md`, Decision Record Tier Variants). Tier C decisions have no `Status` field of their own — they are governed by their parent plan's status.

## Transitions

- `Draft` → `Draft` (revision, new commit each time)
- `Draft` → `Approved` (human confirms; commit the transition)
- `Draft` → `Deferred` (human postpones; commit the transition)
- `Deferred` → `Draft` (revisited later) or `Deferred` → `Approved` (approved directly from a deferred state)
- `Approved` → `Done` (described work completes)
- `Approved` → `Superseded` (Decision Records only, when a later decision replaces this one)
- `Approved` → `Amending` (Decision Records only; an amendment is proposed and the body edit is applied in the same commit)
- `Amending` → `Approved` (Decision Records only; the human confirms or rejects the proposal — either outcome returns the record to `Approved`)

## Checking whether dependent work may proceed

Always check for `Status: Approved` specifically. Do not write special-case logic for `Deferred`, `Draft`, or any other non-`Approved` value — their absence from `Approved` is sufficient on its own to block dependent work.
