---
name: "chunk-orchestration"
version: "0.3.0"
description: "Orchestrates parallel chunk plan execution across engineering agents with wave-based dispatch and quality gates."
---

## Purpose

Manages the end-to-end execution of an epic's chunk plans. Computes execution waves from the dependency graph, dispatches chunks to engineering agents as subagents, monitors the per-chunk pipeline (track-aware — see Step 3), handles review loops, detects blocks, and advances waves until the epic is complete or fully blocked.

---

## Inputs

- **Approved Epic Plan** — with decomposition complete
- **chunks.json** — validated dependency graph (must have passed `dag-validate`)
- **Chunk Plans** — approved chunk plans for each chunk ID in the graph
- **Branch naming convention** — `{epic-id}/{chunk-number}-{short-description}`

---

## Steps

### Step 1 — Initialize

1. Read `.aiconfig.json` from the project root to resolve artifact paths
2. Read the Epic Plan and confirm `Status: Approved` before proceeding. If the Epic is not `Approved` (e.g. still `Draft` or `Deferred`), stop and report to the human — do not read `chunks.json`. See `skill/plan-lifecycle` — only `Approved` satisfies this gate.
3. Read `chunks.json` for the epic (at `{paths.chunks}/{EpicID}/chunks.json`)
4. Call `dag-compute-waves` to get the ordered wave structure
5. Copy the template from `skills/chunk-orchestration/assets/orchestration-state.json`
6. Populate the state file:
   - Set `epic_id` from chunks.json
   - Set `total_waves` from the wave computation result
   - Set `current_wave` to 0
   - Create a chunk state entry for each chunk (status: `Ready`, wave assignment from computation)
7. Write the state file to `{paths.orchestration}/{EpicID}/orchestration-state.json` (from `.aiconfig.json`, default: `plans/orchestration/`)
8. **Commit plans and orchestration state to main before proceeding:**
   - Verify all chunk plans and the epic plan are committed and pushed to main.
     If any are uncommitted, commit and push them now (directly to main — plans do not use branches).
   - Commit and push the orchestration state file to main.
   - This ensures all worktrees (branched from main) will have access to the plans.
9. Read `orchestration.max_concurrent` from `.aiconfig.json` (default: `4`) — use this as the concurrency limit for all dispatch decisions
10. Run worktree startup validation (skill/worktree-management Step 5) to detect stale worktrees
11. Log: `wave_started` for wave 0

### Step 2 — Dispatch Wave

**⚠️ PREREQUISITE GATE: Every chunk MUST have a dedicated branch and worktree created BEFORE any subagent is dispatched. No exceptions. No fallback to main directory.**

**File Overlap Detection (warning only):**

Before dispatching any chunks in the wave, compare `files_modified` or `components_affected` across all chunk plans in the current wave:
1. Read each chunk plan for the wave and extract the list of files/components it modifies
2. Compare across all chunks in the wave for overlapping file paths
3. If overlap is found:
   - Log: `overlap_warning` with the overlapping chunk IDs and file paths
   - Present the warning to the human: "Potential merge conflict — chunks {X} and {Y} both modify {files}. Proceeding in parallel; conflicts will be handled at PR merge time."
   - **Do not block or serialize.** Proceed with parallel dispatch.

For each chunk in the current wave with status `Ready`:

1. Read the chunk's `agents` field from `chunks.json` to determine its track. The `agents` field is the sole dispatch/pipeline signal — no other field or heuristic determines track:
   - `["Software-Engineer"]` → software track
   - `["AI-Engineer"]` → AI track
   - Missing, empty, or containing an unrecognized agent role → do not dispatch. Mark chunk `Blocked` with reason "Unrecognized or missing agent assignment for chunk {id}", log `chunk_blocked`, add an escalation entry, and continue with other chunks in the wave. Do not guess a default track.
   - More than one entry in `agents` → out of scope for this skill version. Do not dispatch; mark `Blocked` with reason "Multi-agent `agents` array not supported for chunk {id} — split the chunk instead" and escalate.
2. Verify the chunk's plan is gated appropriately for its track (see `skill/plan-lifecycle` — no status other than `Approved`, including `Deferred`, satisfies this check):
   - Software track: the Chunk Plan (per `skill/chunk-planning`) exists and its `Status` is `Approved`.
   - AI track: AI-Engineer's own plan artifact is gated — either a Tier-1/2 "no written plan required" determination (per `skill/complexity-tiers`) or, for Tier 3, a written plan (per `skill/ai-engineering-plan`) with `Status: Approved`. This gate is never weakened relative to the software track — do not dispatch an AI-track chunk without it.
3. **Create branch and worktree** (skill/worktree-management Steps 1–3):
   - Determine the branch name: `{epic-id}/{chunk-id}-{short-title}`
   - Resolve the worktree path from `paths.worktrees` config
   - Create the worktree on a new branch from `main`:
     ```bash
     git worktree add <worktree-path> -b <branch-name> main
     ```
   - Run dependency installation in the worktree
   - Confirm the worktree exists and is on the correct branch
   - Record `worktree_path` and `branch` in the chunk state
   - **If worktree creation fails → mark chunk as `Blocked`, do NOT dispatch**
4. **Only after worktree is confirmed**, dispatch the track's implementing subagent with:
   - The chunk plan path (software track) or plan/tier-determination reference (AI track)
   - The branch name
   - **The worktree path as the agent's working directory** (the agent works HERE, not in the main repo)
   - Instruction to implement per the plan

   Software track: dispatch a Software-Engineer subagent — unchanged from today.

   AI track: dispatch an AI-Engineer subagent, with the explicit instruction to self-validate (run its own validation tests per its hard rule "Always run tests before declaring work complete") before reporting complete. AI-Engineer's self-validation replaces the Test-Engineer step in the AI-track pipeline (see Step 3).
5. Update chunk status to `Implementing`
6. Log: `chunk_dispatched` with agent, branch, and worktree path details

Constraints:
- Maximum concurrent subagents is read from `orchestration.max_concurrent` (default: 4)
- If more chunks in a wave than the concurrency limit, queue the rest and dispatch as slots free up
- Never dispatch a chunk whose dependencies are not all `Done`
- If worktree creation fails, mark chunk as `Blocked` with reason and do not dispatch

### Step 3 — Monitor Pipeline

As each subagent completes, advance the chunk through its pipeline. The pipeline shape is determined by the chunk's `agents` field (track), read in Step 2 — Test-Engineer is skipped for AI-track chunks only; Principal-Engineer review is never skipped for either track.

**Software track (`agents: ["Software-Engineer"]`) — SE → TE → PE, unchanged:**

**After Software-Engineer completes:**
1. Verify SE reported that changes are committed and pushed to the chunk's branch
2. Update chunk status to `Testing`
3. Dispatch Test-Engineer subagent for the same branch, chunk plan, and worktree path
4. Log: `chunk_status_changed`

**After Test-Engineer completes:**
1. Verify TE reported that test files are committed and pushed to the chunk's branch
2. Update chunk status to `Reviewing`
3. Dispatch Principal-Engineer subagent for the same branch, chunk plan, and worktree path
4. Log: `chunk_status_changed`

**AI track (`agents: ["AI-Engineer"]`) — AI-Engineer implements + self-validates → PE, Test-Engineer skipped:**

**After AI-Engineer completes:**
1. Verify AI-Engineer reported that changes are committed and pushed to the chunk's branch, and that it self-validated (ran its own validation tests) before reporting complete
2. Update chunk status directly to `Reviewing` (skip `Testing` — Test-Engineer is not dispatched for AI-track chunks)
3. Dispatch Principal-Engineer subagent for the same branch, chunk plan, and worktree path
4. Log: `chunk_status_changed`

**After Principal-Engineer completes — APPROVED (both tracks):**
1. Update chunk status to `Done`
2. Re-dispatch the chunk's implementing agent (Software-Engineer for software-track, AI-Engineer for AI-track — same agent that implemented the chunk in Step 2) with instruction to create a PR:
   - Same branch and worktree path
   - Instruction: "Create a pull request from this branch to main via `gh pr create`"
   - The agent creates the PR and reports the URL
3. Record the PR number and URL in the chunk's `pr_number` and `pr_url` fields
4. Log: `chunk_status_changed`
5. Log: `pr_created` with PR number and URL details
6. Check if a queued chunk can now be dispatched (free slot)
7. Check if the wave is complete (Step 5)

Note: The worktree remains active until the human confirms the PR is merged.
When the human confirms merge, run worktree teardown (skill/worktree-management Step 4):
- Remove the worktree directory
- Delete the merged branch
- Clear `worktree_path` in chunk state
- Log: `worktree_removed`

**After Principal-Engineer completes — NEEDS_CHANGES (both tracks):**
1. Increment chunk `iterations`
2. If `iterations` < 5:
   - Update chunk status to `Implementing`
   - Dispatch the chunk's implementing agent (Software-Engineer for software-track, AI-Engineer for AI-track) with the review findings. For AI-track chunks, include the same self-validation instruction as the original dispatch.
   - Log: `review_loop` with iteration count
3. If `iterations` >= 5:
   - Mark chunk as `Blocked` with reason: "Review loop exhausted (5 iterations)"
   - Add an escalation entry
   - Log: `escalation_raised`
   - Continue with remaining chunks

### Step 4 — Handle Blocks

A chunk may be blocked for reasons beyond review loops:

**Out-of-domain work detected:** AI component authoring (declarative skills, agents, steering, server definitions) is in-domain — it dispatches to AI-Engineer via the AI track (Step 2/3), not this edge case. If a chunk plan references components, skills, or work genuinely outside both the software and AI tracks (e.g., infrastructure provisioning unrelated to either track), mark it as:
- Status: `Blocked`
- `blocked_reason`: description of what's needed (e.g., "Requires new skill to be authored by AI Engineer")
- Log: `chunk_blocked`
- Add escalation entry
- Surface to human: state what is needed and which chunk is affected

**Merge conflict — Conflict Resolution Sub-Flow:**

Triggered by: human reports conflict during PR review, OR wave-boundary rebase fails (Step 5).

1. Update chunk status to `Conflict`
2. Log: `conflict_detected` with branch name, conflicting files (if known), and trigger source
3. Dispatch Software-Engineer subagent to the chunk's worktree with instructions:
   - Fetch latest main: `git fetch origin main`
   - Rebase onto main: `git rebase origin/main`
   - Resolve any conflicts that arise
   - Run build/lint to verify the resolution compiles and passes basic checks
   - Commit the resolution and push the branch (force-push is acceptable here — it's a feature branch with only agent commits)
   - Report success or failure
4. **If SE reports success:**
   - Update chunk status to `Implementing`
   - Reset `iterations` to 0
   - Log: `conflict_resolved` with details of which files were resolved
   - Re-dispatch SE to verify/complete implementation in context of the new base
   - The full pipeline restarts: SE → TE → PE
5. **If SE reports inability to resolve** (complex conflict, semantic ambiguity, or build failures after resolution):
   - Mark chunk as `Blocked`
   - `blocked_reason`: "Merge conflict requires human resolution on branch {branch}: {conflicting files}"
   - Log: `conflict_escalated`
   - Add escalation entry with:
     - The conflicting file paths
     - The branch name
     - Which chunks contributed to the conflict (if known from overlap warnings)
   - Present to human: state the branch, conflicting files, and suggest `git rebase origin/main` in the worktree to resolve manually
6. **When human reports conflict resolved** (after manual intervention):
   - Update chunk status to `Implementing`
   - Reset `iterations` to 0
   - Set escalation `resolved` to true
   - Log: `chunk_unblocked`
   - Pipeline restarts from SE (full SE → TE → PE)

**Decision hand-off — Decision Hand-off Sub-Flow:** (Authored under AIF-002-006)

Triggered by: a dispatched subagent reports, via `skill/decision-triage`, that
continuing requires a Tier A/B decision outside its own domain, or requires
human approval before it can proceed.

1. Update chunk status to `Blocked` with a structured `blocked_reason`
   (domain, tier, owning agent — from the `decision-triage` hand-off signal).
   Log: `decision_handoff_detected` with the domain, tier, and owning agent.
2. If Engineering-Manager itself owns the domain (Process), author the
   decision directly via `decision-triage` -> `decision-record`/
   `decision-brief`. Otherwise, dispatch the owning agent as a subagent to
   author it the same way. Log: `decision_authored` once the Draft decision is
   committed.
3. Present the Draft decision to the human alongside the existing
   blocked-chunk escalation. The decision's own `skill/plan-lifecycle` gate —
   not orchestration state — governs whether it becomes `Approved` or
   `Deferred`. Do not track a parallel approval state in the orchestration
   file.
4. Once the decision reaches `Approved`: reuse the existing generic "when
   human unblocks" behavior (see above) unchanged — chunk status `Blocked` ->
   `Ready`, `blocked_reason` cleared, escalation `resolved` set to true. Log:
   `chunk_unblocked` and `decision_handoff_resolved`. No new resume mechanic —
   the chunk's full pipeline (SE -> TE -> PE) redispatches from `Ready` exactly
   as any other unblock does.
5. If the decision is `Deferred` instead: the chunk remains `Blocked`.
   `Deferred` never satisfies the gate (per `skill/plan-lifecycle`) — do not
   clear `blocked_reason` or advance the chunk.

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
   - Present all open PRs for the wave to the human
   - Wait for human to confirm all PRs in the wave are merged
   - Once confirmed, tear down worktrees for all merged chunks (skill/worktree-management Step 4)
   - Log: `wave_completed`
   - Increment `current_wave`
   - If more waves remain:
     - **Wave-Boundary Rebase** — ensure next wave's branches are up-to-date with main:
       1. Run `git fetch origin main` in the main repository
       2. For each chunk in the new wave that already has a worktree (resumed/unblocked chunks only):
          - In the chunk's worktree, run `git rebase origin/main`
          - If rebase succeeds cleanly: log `wave_rebase` with chunk ID, proceed normally
          - If rebase conflicts: enter the Conflict Resolution Sub-Flow (Step 4) for that chunk.
            The chunk cannot be dispatched until conflict is resolved.
       3. For new chunks (no worktree yet): no action needed — they will branch from the current main when their worktree is created in Step 2, so they naturally get the latest code.
     - Set all chunks in the new wave whose dependencies are `Done` to `Ready` (except any currently in `Conflict` from the rebase above)
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

- **Orchestration state file** — continuously updated at `{paths.orchestration}/{EpicID}/orchestration-state.json`
- **Completion summary** — presented to human when all waves are done or fully blocked

---

## Edge Cases

- **All chunks in a wave are blocked** — set overall status to `Blocked`, present all escalations to human, wait for unblock before continuing.
- **Human unblocks a chunk mid-wave** — resume immediately if the chunk's wave is current. If it's a past wave, dispatch it now (it's overdue).
- **Chunk plan not found or not approved** — mark chunk `Blocked` with reason "Chunk plan missing or not approved". Do not dispatch without an approved plan.
- **Epic Plan not `Approved`** — stop at Step 1 before reading `chunks.json`; report to the human. Do not treat `Draft` or `Deferred` as sufficient.
- **Agent subagent fails unexpectedly** — mark chunk `Blocked` with reason "Agent failure: {error}". Log and escalate. Do not retry automatically.
- **Epic has only one chunk** — still follow the full pipeline (SE → TE → PE). No shortcuts.
- **Chunk depends on a blocked chunk** — remains in `Ready` but cannot be dispatched. Will dispatch once the dependency is unblocked and completed.
- **Human requests early termination** — set overall status to `Blocked`, log the reason, stop dispatching. State file preserves progress for later resumption.
- **Worktree creation fails** — mark chunk as `Blocked` with reason from worktree-management. Do not dispatch. Common causes: path conflict, disk space, branch already checked out in another worktree.
- **Agent needs to resume in existing worktree** — when a blocked chunk is unblocked and re-dispatched, the worktree may already exist. Worktree-management Step 2 handles this (detects existing valid worktree and reuses it).
- **Merge conflict during PR review** — human reports the conflict. EM enters the Conflict Resolution Sub-Flow (Step 4). The chunk goes from `Done` → `Conflict` → `Implementing` (pipeline restarts). The existing PR should be updated by the force-push after resolution.
- **Wave-boundary rebase conflicts on multiple chunks** — each conflicting chunk enters the sub-flow independently. Non-conflicting chunks in the wave proceed normally with dispatch.
- **Conflict resolution introduces test failures** — handled naturally because the pipeline restarts from SE. TE will catch the failures in the Testing phase.
- **Human resolves conflict but doesn't push** — SE is re-dispatched and will detect the branch state. If the rebase is incomplete or uncommitted, SE completes it. Instruct the human to commit and push their resolution before reporting "unblocked."
- **Overlap warning false positive** — two chunks touch the same file but different sections. No action needed; the warning is informational. Actual conflicts are handled reactively if they occur at merge time.
