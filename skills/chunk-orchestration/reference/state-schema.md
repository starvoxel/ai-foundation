# Orchestration State Schema

The engineering-manager maintains an orchestration state file throughout execution.
This is the single source of truth for chunk pipeline status, wave progression, escalations, and the coordination work log.

Start from the template at `skills/chunk-orchestration/assets/orchestration-state.json`.

---

## Location

```
{paths.orchestration}/{EpicID}/orchestration-state.json
```

Resolved from `.aiconfig.json` at project root. Default: `plans/orchestration/`.

---

## Fields

### Top-level

| Field          | Type   | Required | Description                                          |
| -------------- | ------ | -------- | ---------------------------------------------------- |
| `epic_id`      | string | Yes      | Parent epic ID for traceability                      |
| `status`       | string | Yes      | Overall status: `In Progress`, `Complete`, `Blocked` |
| `current_wave` | number | Yes      | Index of the active wave (0-based)                   |
| `total_waves`  | number | Yes      | Total number of waves computed from DAG              |
| `chunks`       | array  | Yes      | Array of chunk state objects                         |
| `escalations`  | array  | Yes      | Array of issues raised to human                      |
| `log`          | array  | Yes      | Chronological work log entries                       |

### Chunk state object

| Field            | Type         | Required | Description                                              |
| ---------------- | ------------ | -------- | -------------------------------------------------------- |
| `id`             | string       | Yes      | Chunk ID (matches chunks.json)                           |
| `wave`           | number       | Yes      | Which wave this chunk belongs to (0-based)               |
| `status`         | string       | Yes      | Current status (see transitions below)                   |
| `branch`         | string       | Yes      | Branch name, empty string if not yet started             |
| `worktree_path`  | string       | Yes      | Worktree directory path, empty string if not yet created |
| `pr_number`      | number\|null | Yes      | GitHub PR number once created, null before then          |
| `pr_url`         | string\|null | Yes      | GitHub PR URL once created, null before then             |
| `iterations`     | number       | Yes      | Review loop count (0–5)                                  |
| `blocked_reason` | string\|null | Yes      | Null when not blocked, reason string when blocked        |
| `agents`         | string[]     | Yes      | Assigned agent roles                                     |

### Chunk status values

| Status         | Meaning                                          |
| -------------- | ------------------------------------------------ |
| `Ready`        | Dependencies satisfied, waiting for dispatch     |
| `Implementing` | Software-Engineer is working                     |
| `Testing`      | Test-Engineer is working                         |
| `Reviewing`    | Principal-Engineer is reviewing                  |
| `Done`         | Approved and complete                            |
| `Conflict`     | Merge conflict detected — resolution in progress |
| `Blocked`      | Cannot proceed — see `blocked_reason`            |

### Status transitions

```
Ready → Implementing → Testing → Reviewing → Done
                                      │
                                      ▼
                              Implementing (review loop, iterations++)

Any pipeline status → Conflict (when merge conflict detected)
Conflict → Implementing (when resolved — pipeline restarts, iterations reset to 0)
Conflict → Blocked (when SE cannot resolve — human intervention needed)

Any status → Blocked (with reason)
Blocked → Ready (when human unblocks)
```

- Maximum 5 iterations through the review loop before escalation.
- A chunk may be blocked at any point (e.g., requires out-of-domain work, merge conflict, human input needed).
- When a conflict is resolved, the pipeline restarts from Implementing with iterations reset. This ensures tests and review validate the post-resolution code.

### Escalation object

| Field       | Type    | Required | Description                          |
| ----------- | ------- | -------- | ------------------------------------ |
| `chunk_id`  | string  | Yes      | Which chunk triggered the escalation |
| `reason`    | string  | Yes      | Why it was escalated                 |
| `raised_at` | string  | Yes      | ISO 8601 timestamp                   |
| `resolved`  | boolean | Yes      | Whether the human has resolved it    |

### Log entry object

| Field       | Type         | Required | Description                              |
| ----------- | ------------ | -------- | ---------------------------------------- |
| `timestamp` | string       | Yes      | ISO 8601 timestamp                       |
| `agent`     | string       | Yes      | Which agent performed the action         |
| `action`    | string       | Yes      | What happened (see actions below)        |
| `chunk_id`  | string\|null | Yes      | Which chunk (null for wave-level events) |
| `details`   | string       | Yes      | Human-readable description               |

### Log actions

<!-- decision_handoff_detected, decision_authored, decision_handoff_resolved rows below: Authored under AIF-002-006 -->

| Action                      | Description                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wave_started`              | A new wave began dispatching                                                                                                                                                                                 |
| `wave_completed`            | All chunks in a wave are Done                                                                                                                                                                                |
| `chunk_dispatched`          | Chunk assigned to an agent                                                                                                                                                                                   |
| `chunk_status_changed`      | Chunk transitioned to a new status                                                                                                                                                                           |
| `pr_created`                | PR created for a Done chunk; `pr_number`/`pr_url` recorded in chunk state                                                                                                                                    |
| `review_loop`               | Chunk returned from review for correction                                                                                                                                                                    |
| `escalation_raised`         | Issue escalated to human                                                                                                                                                                                     |
| `escalation_resolved`       | Human resolved a prior escalation                                                                                                                                                                            |
| `chunk_blocked`             | Chunk marked as blocked                                                                                                                                                                                      |
| `chunk_unblocked`           | Chunk unblocked and returned to Ready                                                                                                                                                                        |
| `decision_handoff_detected` | A dispatched subagent's `decision-triage` hand-off (cross-domain or approval-gated Tier A/B decision) was detected and the chunk was marked `Blocked`                                                        |
| `decision_authored`         | A Draft decision record (Tier A) or brief (Tier B) was authored and committed in response to a decision hand-off — either directly by Engineering-Manager (Process domain) or by the dispatched owning agent |
| `decision_handoff_resolved` | The hand-off decision reached `Approved` and the chunk was unblocked via the existing generic unblock mechanic                                                                                               |
| `conflict_detected`         | Merge conflict detected on a chunk branch                                                                                                                                                                    |
| `conflict_resolved`         | SE successfully resolved the merge conflict                                                                                                                                                                  |
| `conflict_escalated`        | Conflict could not be auto-resolved, escalated to human                                                                                                                                                      |
| `overlap_warning`           | File overlap detected between chunks in the same wave                                                                                                                                                        |
| `wave_rebase`               | Wave boundary rebase performed on existing branches                                                                                                                                                          |
| `worktree_created`          | Worktree created for a chunk                                                                                                                                                                                 |
| `worktree_removed`          | Worktree torn down after PR merge confirmed                                                                                                                                                                  |
| `orchestration_complete`    | All waves done, epic fully implemented                                                                                                                                                                       |

---

## Rules

- The orchestration state file is updated after every status transition.
- Log entries are append-only — never delete or modify past entries.
- Only the engineering-manager writes to this file.
- The `current_wave` only advances when all non-blocked chunks in the wave are `Done`.
- Overall `status` is `Blocked` if all remaining chunks are blocked and no progress can be made.
- Overall `status` is `Complete` when all chunks are `Done`.
