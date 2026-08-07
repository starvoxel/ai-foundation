---
name: "chunk-orchestration"
version: "0.1.0"
description: "Orchestrates parallel chunk plan execution across engineering agents with wave-based dispatch and quality gates."
---

## Purpose

Manages the end-to-end execution of an epic's chunk plans. Computes execution waves
from the dependency graph, dispatches chunks to engineering agents as subagents,
monitors the per-chunk pipeline (SE → TE → PE), handles review loops, detects blocks,
and advances waves until the epic is complete or fully blocked.

---

## Inputs

- **Approved Epic Plan** — with decomposition complete
- **chunks.json** — validated dependency graph (must have passed `dag-validate`)
- **Chunk Plans** — approved chunk plans for each chunk ID in the graph
- **Branch naming convention** — `{epic-id}/{chunk-number}-{short-description}`

---

## Steps

### Step 1 — Initialize

1. Read `chunks.json` for the epic
2. Call `dag-compute-waves` to get the ordered wave structure
3. Copy the template from `skills/chunk-orchestration/assets/orchestration-state.json`
4. Populate the state file:
   - Set `epic_id` from chunks.json
   - Set `total_waves` from the wave computation result
   - Set `current_wave` to 0
   - Create a chunk state entry for each chunk (status: `Ready`, wave assignment from computation)
5. Write the state file to `plans/{ProjectName}/{EpicID}/orchestration-state.json`
6. Log: `wave_started` for wave 0

### Step 2 — Dispatch Wave

For each chunk in the current wave with status `Ready`:

1. Verify the chunk plan exists and is approved
2. Determine the branch name: `{epic-id}/{chunk-id}-{short-title}`
3. Dispatch a Software-Engineer subagent with:
   - The chunk plan path
   - The branch name
   - Instruction to implement per the plan
4. Update chunk status to `Implementing`
5. Log: `chunk_dispatched` with agent and branch details

Constraints:
- Maximum 4 concurrent subagents at any time
- If more than 4 chunks in a wave, queue the rest and dispatch as slots free up
- Never dispatch a chunk whose dependencies are not all `Done`

### Step 3 — Monitor Pipeline

As each subagent completes, advance the chunk through its pipeline:

**After Software-Engineer completes:**
1. Update chunk status to `Testing`
2. Dispatch Test-Engineer subagent for the same branch and chunk plan
3. Log: `chunk_status_changed`

**After Test-Engineer completes:**
1. Update chunk status to `Reviewing`
2. Dispatch Principal-Engineer subagent for the same branch and chunk plan
3. Log: `chunk_status_changed`

**After Principal-Engineer completes — APPROVED:**
1. Update chunk status to `Done`
2. Log: `chunk_status_changed`
3. Check if a queued chunk can now be dispatched (free slot)
4. Check if the wave is complete (Step 5)

**After Principal-Engineer completes — NEEDS_CHANGES:**
1. Increment chunk `iterations`
2. If `iterations` < 5:
   - Update chunk status to `Implementing`
   - Dispatch Software-Engineer subagent with the review findings
   - Log: `review_loop` with iteration count
3. If `iterations` >= 5:
   - Mark chunk as `Blocked` with reason: "Review loop exhausted (5 iterations)"
   - Add an escalation entry
   - Log: `escalation_raised`
   - Continue with remaining chunks

### Step 4 — Handle Blocks

A chunk may be blocked for reasons beyond review loops:

**Out-of-domain work detected:**
If a chunk plan references components, skills, or work outside the engineering domain
(e.g., AI component authoring, infrastructure provisioning), mark it as:
- Status: `Blocked`
- `blocked_reason`: description of what's needed (e.g., "Requires new skill to be authored by AI Engineer")
- Log: `chunk_blocked`
- Add escalation entry
- Surface to human: state what is needed and which chunk is affected

**Merge conflict:**
If an agent reports a merge conflict it cannot resolve:
- Mark chunk as `Blocked`
- `blocked_reason`: "Merge conflict on branch {branch}"
- Log: `chunk_blocked`
- Add escalation entry

**Blocked chunks and wave progression:**
- A blocked chunk does NOT prevent other chunks in the wave from completing
- A blocked chunk DOES prevent any chunk that depends on it from dispatching
- If all remaining undone chunks are blocked and no progress is possible, set overall status to `Blocked` and escalate

**When human unblocks:**
- Set chunk status back to `Ready`
- Clear `blocked_reason`
- Set escalation `resolved` to true
- Log: `chunk_unblocked`
- Resume dispatch if the chunk's wave is current or past

### Step 5 — Advance Wave

After each chunk completion, check wave status:

1. Are all non-blocked chunks in the current wave `Done`?
2. If yes:
   - Log: `wave_completed`
   - Increment `current_wave`
   - If more waves remain:
     - Set all chunks in the new wave whose dependencies are `Done` to `Ready`
     - Log: `wave_started`
     - Go to Step 2 (dispatch new wave)
   - If no more waves remain:
     - Go to Step 6

### Step 6 — Complete

1. Set overall status to `Complete`
2. Log: `orchestration_complete`
3. Produce a summary:
   - Total chunks completed
   - Total review iterations across all chunks
   - Any chunks still blocked (with reasons)
   - Total elapsed time (first log entry to last)
4. Present summary to human

---

## Outputs

- **Orchestration state file** — continuously updated at `plans/{ProjectName}/{EpicID}/orchestration-state.json`
- **Completion summary** — presented to human when all waves are done or fully blocked

---

## Edge Cases

- **All chunks in a wave are blocked** — set overall status to `Blocked`, present all escalations to human, wait for unblock before continuing.
- **Human unblocks a chunk mid-wave** — resume immediately if the chunk's wave is current. If it's a past wave, dispatch it now (it's overdue).
- **Chunk plan not found or not approved** — mark chunk `Blocked` with reason "Chunk plan missing or not approved". Do not dispatch without an approved plan.
- **Agent subagent fails unexpectedly** — mark chunk `Blocked` with reason "Agent failure: {error}". Log and escalate. Do not retry automatically.
- **Epic has only one chunk** — still follow the full pipeline (SE → TE → PE). No shortcuts.
- **Chunk depends on a blocked chunk** — remains in `Ready` but cannot be dispatched. Will dispatch once the dependency is unblocked and completed.
- **Human requests early termination** — set overall status to `Blocked`, log the reason, stop dispatching. State file preserves progress for later resumption.
