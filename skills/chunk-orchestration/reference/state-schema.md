# Orchestration State Schema

The engineering-manager maintains an orchestration state file throughout execution.
This is the single source of truth for chunk pipeline status, wave progression,
escalations, and the coordination work log.

Start from the template at `skills/chunk-orchestration/assets/orchestration-state.json`.

---

## Location

```
plans/{ProjectName}/{EpicID}/orchestration-state.json
```

---

## Fields

### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `epic_id` | string | Yes | Parent epic ID for traceability |
| `status` | string | Yes | Overall status: `In Progress`, `Complete`, `Blocked` |
| `current_wave` | number | Yes | Index of the active wave (0-based) |
| `total_waves` | number | Yes | Total number of waves computed from DAG |
| `chunks` | array | Yes | Array of chunk state objects |
| `escalations` | array | Yes | Array of issues raised to human |
| `log` | array | Yes | Chronological work log entries |

### Chunk state object

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Chunk ID (matches chunks.json) |
| `wave` | number | Yes | Which wave this chunk belongs to (0-based) |
| `status` | string | Yes | Current status (see transitions below) |
| `branch` | string | Yes | Branch name, empty string if not yet started |
| `iterations` | number | Yes | Review loop count (0–5) |
| `blocked_reason` | string\|null | Yes | Null when not blocked, reason string when blocked |
| `agents` | string[] | Yes | Assigned agent roles |

### Chunk status values

| Status | Meaning |
|---|---|
| `Ready` | Dependencies satisfied, waiting for dispatch |
| `Implementing` | Software-Engineer is working |
| `Testing` | Test-Engineer is working |
| `Reviewing` | Principal-Engineer is reviewing |
| `Done` | Approved and complete |
| `Blocked` | Cannot proceed — see `blocked_reason` |

### Status transitions

```
Ready → Implementing → Testing → Reviewing → Done
                                      │
                                      ▼
                              Implementing (review loop, iterations++)

Any status → Blocked (with reason)
Blocked → Ready (when human unblocks)
```

- Maximum 5 iterations through the review loop before escalation.
- A chunk may be blocked at any point (e.g., requires out-of-domain work, merge conflict, human input needed).

### Escalation object

| Field | Type | Required | Description |
|---|---|---|---|
| `chunk_id` | string | Yes | Which chunk triggered the escalation |
| `reason` | string | Yes | Why it was escalated |
| `raised_at` | string | Yes | ISO 8601 timestamp |
| `resolved` | boolean | Yes | Whether the human has resolved it |

### Log entry object

| Field | Type | Required | Description |
|---|---|---|---|
| `timestamp` | string | Yes | ISO 8601 timestamp |
| `agent` | string | Yes | Which agent performed the action |
| `action` | string | Yes | What happened (see actions below) |
| `chunk_id` | string\|null | Yes | Which chunk (null for wave-level events) |
| `details` | string | Yes | Human-readable description |

### Log actions

| Action | Description |
|---|---|
| `wave_started` | A new wave began dispatching |
| `wave_completed` | All chunks in a wave are Done |
| `chunk_dispatched` | Chunk assigned to an agent |
| `chunk_status_changed` | Chunk transitioned to a new status |
| `review_loop` | Chunk returned from review for correction |
| `escalation_raised` | Issue escalated to human |
| `escalation_resolved` | Human resolved a prior escalation |
| `chunk_blocked` | Chunk marked as blocked |
| `chunk_unblocked` | Chunk unblocked and returned to Ready |
| `orchestration_complete` | All waves done, epic fully implemented |

---

## Rules

- The orchestration state file is updated after every status transition.
- Log entries are append-only — never delete or modify past entries.
- Only the engineering-manager writes to this file.
- The `current_wave` only advances when all non-blocked chunks in the wave are `Done`.
- Overall `status` is `Blocked` if all remaining chunks are blocked and no progress can be made.
- Overall `status` is `Complete` when all chunks are `Done`.
