# Decision Record: Co-locate Epic/Chunk Plan Artifacts, Split Work Log from Plan Body

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-011 |
| Project | ai-foundation |
| Status | Draft |
| Author (Agent) | Architect |
| Approved By | Pending |
| Created | 2026-08-13 |
| Referenced By | None yet — will govern the Epic implementing this change |

---

## Problem Statement

Epic Plans, `chunks.json`, and Chunk Plans are permanently coupled (a Chunk Plan cannot exist without a parent Epic) but currently live in separate top-level trees (`{paths.epics}/`, `{paths.chunks}/`). Additionally, every plan template embeds a `Work Log` section directly in the plan body, which grows unbounded as agents append entries, cluttering the reviewable plan content. Now that chunk artifacts are already folder-based (`chunks/{EpicID}/`), this is a good point to fix both.

## Constraints & Requirements

What was non-negotiable:
- No change to `skill/plan-lifecycle`'s commit-gate mechanics (Draft → revision → Approved, `ai-git` commits) — only artifact *location* and *internal structure* are in scope.
- No change to `chunks-schema.md`'s `agents`/`depends_on` fields (unrelated, settled by AIF-005/AIF-010).
- Must not introduce merge-conflict risk across chunks dispatched in parallel on separate branches/worktrees (`chunk-orchestration` Step 2 already actively detects and warns about file-overlap risk between parallel chunks — any new shared file must not silently reintroduce that risk).
- Work Log entry format (`[timestamp] [Agent] [Action] [Plan ID] [Details]`) is unchanged — only *where* entries are written changes.

What was a preference but not a hard requirement:
- Minimizing total file count per epic.
- Keeping the change mechanical (template/path edits) rather than a deep rework of any skill's logic.

---

## Options Explored

### Option A: Unified per-epic folder, single shared Work Log file

**Summary**: Collapse `{paths.epics}/` and `{paths.chunks}/` into one `{paths.plans}/{EpicID}/` folder containing `epic.md`, `chunks.json`, one `{###}_{ShortTitle}.plan.md` per chunk, and a single `worklog.md` shared by the epic and all its chunks.

**Strengths**: Simplest mental model — "everything about this epic is one file, `worklog.md` is the whole story read top-to-bottom." Fewest files.

**Weaknesses**: `chunk-orchestration` dispatches each chunk to its own branch/worktree in parallel. If two chunks in the same wave both append to the same `worklog.md`, their branches diverge on that file and collide at merge time — exactly the class of conflict `chunk-orchestration`'s File Overlap Detection step already exists to warn about. This option manufactures a guaranteed overlap where none needs to exist.

**Verdict**: Not chosen — reintroduces a conflict risk the existing orchestration design deliberately avoids.

### Option B: Unified per-epic folder, one Work Log file per artifact

**Summary**: Same folder co-location as Option A (`{paths.plans}/{EpicID}/epic.md`, `chunks.json`, per-chunk `.plan.md` files), but each artifact gets its own sibling Work Log file: `epic.worklog.md` for the epic, `{###}_{ShortTitle}.worklog.md` for each chunk. Plan templates drop their `Work Log` section entirely; `plan-lifecycle` and the two planning skills point agents at the sibling file instead. Orchestration milestone events additionally get mirrored into `epic.worklog.md` (see Design section).

**Strengths**: Achieves full co-location (everything for `AIF-001` is one `ls` away). Each chunk's Work Log lives only on that chunk's own branch/worktree — no cross-branch shared-file writes, so no new merge-conflict surface. Epic-level entries (decomposition, orchestration milestones) are written on `main` only, also conflict-free. Change is mechanical: move Section 10/14 content out, leave format untouched. `epic.worklog.md` becomes a single readable narrative of an epic's major progression without needing to open `orchestration-state.json`.

**Weaknesses**: More files than Option A (2 files per artifact instead of 1). Reconstructing "the full epic history" means reading N+1 files instead of one — mitigated by each file being small and the epic file linking to them.

**Verdict**: Chosen — delivers the co-location goal and the worklog-simplification goal without reintroducing parallel-dispatch conflict risk, and gives a single narrative log of epic-level progression per the human's direction.

### Option C: Keep `epics/` / `chunks/` as separate top-level trees, only split the Work Log out

**Summary**: Leave the current split-tree layout untouched; only move each artifact's `Work Log` section into a sibling file next to it (still in its current, separate location).

**Strengths**: Smallest possible diff — no path-scheme migration, no change to `paths.epics`/`paths.chunks` resolution, no touch to `epic-planning` Step 2's ID-scanning logic.

**Weaknesses**: Does not address the actual request — Epic and Chunk plans would still live in separate directory trees, which is the specific problem raised ("why don't we have them live closer together").

**Verdict**: Not chosen — solves only half the stated problem.

---

## Decision

**Chosen approach**: Option B — unified per-epic folder (`{paths.plans}/{EpicID}/`) holding the Epic Plan, `chunks.json`, and all Chunk Plans, with a separate Work Log file per artifact (not shared), plus selective mirroring of orchestration milestones into the epic-level Work Log.

**Rationale**:
Co-location and worklog-splitting are both worth doing, but only Option B achieves both without contradicting an already-settled design constraint: `chunk-orchestration` deliberately isolates parallel chunks onto separate branches/worktrees and treats shared-file writes across chunks as a conflict risk to be warned about, not created. A single shared `worklog.md` (Option A) would force every parallel chunk in a wave to write to the same file, guaranteeing exactly that conflict on every multi-chunk epic. Per-artifact worklog files keep each chunk's append-only history scoped to that chunk's own branch, matching the existing isolation model exactly, while still fully satisfying "live closer together" via the shared parent folder. Mirroring orchestration milestones into `epic.worklog.md` (human direction, see Design) gives a single readable account of an epic's major progression without merging low-level, high-frequency orchestration events into any chunk's branch-local file.

**Trade-offs accepted**:
- More total files per epic than a single shared log (N chunks → N+1 plan files + N+1 worklog files + 1 `chunks.json`, all in one folder). Judged an acceptable cost given the conflict risk it avoids.
- Existing `AIF-001` epic (currently split across `docs/plans/epics/` and `docs/plans/chunks/AIF-001/`, git status shows a deleted top-level `chunks.json` and new untracked folders) will need a one-time migration to the new layout as part of implementing this decision, rather than being grandfathered.
- `epic.worklog.md` is written to from two places (Tech-Lead during planning/decomposition, and `chunk-orchestration` during dispatch) rather than one. Both writers operate on `main` (orchestration state changes and epic-level actions are not chunk-worktree operations), so this does not reintroduce the parallel-write conflict Option A had — but it does mean the file's ownership is shared across two skills, which must stay disciplined about only writing milestone-level entries there, not implementation minutiae.

---

## Design

### Work Log file split

Per epic, under `{paths.plans}/{EpicID}/`:

| File | Written by | Scope |
|---|---|---|
| `epic.worklog.md` | Tech-Lead (epic-planning), `chunk-orchestration` (milestones only) | Epic-level actions (Created/Revised/Approved/Decomposed) plus mirrored orchestration milestones |
| `{###}_{ShortTitle}.worklog.md` | Software-Engineer / Test-Engineer / Principal-Engineer (or AI-Engineer for AI-track) | That chunk's own implementation history, written on the chunk's branch/worktree |

Each file is entry-only (no heading structure required beyond a one-line title), using the existing bracket format:
`[{YYYY-MM-DD HH:mm}] [{Agent}] [{Action}] [{Plan ID}] [{Details}]`

Plan templates (`epic-planning/reference/template.md` Section 10, `chunk-planning/reference/template.md` Section 14) are replaced with a single pointer line, e.g.:
`Work Log: see ./epic.worklog.md` / `Work Log: see ./{###}_{ShortTitle}.worklog.md`

### Orchestration milestone mirroring

`chunk-orchestration` continues to write every event to `orchestration-state.json` unchanged (that remains the full-fidelity machine log). In addition, at the following milestone points it appends one line to `epic.worklog.md` in the same bracket format (`[Agent]` = `Engineering-Manager` or the orchestrating role, `[Plan ID]` = the Epic ID):

- `wave_started` — start of each wave
- `wave_completed` — end of each wave, after human confirms PRs merged
- `chunk_blocked` / `escalation_raised` — any escalation surfaced to the human
- `conflict_escalated` — merge conflict requiring human resolution
- `orchestration_complete` — final summary line when the epic finishes

Per-chunk-only events (`chunk_dispatched`, `chunk_status_changed`, individual `review_loop` iterations, etc.) are **not** mirrored — those stay in `orchestration-state.json` and the chunk's own `{###}_{ShortTitle}.worklog.md`, keeping `epic.worklog.md` readable as a "major progression" narrative rather than a full event trace.

---

## Impact on Planning

What Tech-Lead must know when writing the Epic that implements this decision:
- `.aiconfig.json` `paths.epics` / `paths.chunks` collapse into a single `paths.plans`-relative convention: `{paths.plans}/{EpicID}/`. The Epic must specify the exact resolved path config and update `.aiconfig.json` accordingly (this repo's `paths.plans` is currently `docs/plans`).
- Affected skills requiring edits: `epic-planning` (Outputs, Step 2 ID-scan logic, Step 5 decomposition output path, worklog pointer), `chunk-planning` (Outputs, worklog pointer), `chunk-orchestration` (Step 1's `chunks.json` path reference, new milestone-mirroring sub-step per the Design section above), `plan-lifecycle` (commit-gate procedure must reference the new sibling worklog file, not an in-body section).
- Affected templates: `skills/epic-planning/reference/template.md` (remove Section 10, add pointer line), `skills/chunk-planning/reference/template.md` (remove Section 14, add pointer line) — plus a new minimal worklog file convention (title line + bracket-format entries).
- `chunks-schema.md`'s "Location" section needs updating to reflect the new path.
- `AIF-001` (currently `Approved`, decomposition done, chunks not yet dispatched per its own Work Log) needs a migration step: move `epics/AIF-001.epic.md` + `chunks/AIF-001/chunks.json` into `{paths.plans}/AIF-001/`, split its existing Section 10 Work Log out into `epic.worklog.md`. Since no chunk plans exist yet for AIF-001, no chunk-level worklog migration is needed there.
- Components explicitly ruled out: a single shared per-epic worklog file for both epic- and chunk-level entries (Option A) — must not reappear as a "simplification" later without re-litigating the parallel-write conflict rationale above. Mirroring *every* orchestration event (not just milestones) into `epic.worklog.md` was also considered and rejected implicitly by the Design section's explicit milestone list — must not be silently expanded without a documented reason.

---

## Resolved Items / Open Items

### Resolved Items

| # | Item | Resolution |
|---|---|---|
| 1 | Whether `chunk-orchestration`'s own log events should feed the epic-level worklog, or remain fully separate. | Human decided: mirror at key milestones into `epic.worklog.md` for a single narrative of major epic progression, while `orchestration-state.json` remains the full-fidelity machine log. Milestone event list specified in the Design section above. |

### Open Items

| # | Item | Owner |
|---|---|---|
| 1 | Exact new `paths.*` key(s) in `.aiconfig.json` (e.g. keep `paths.epics`/`paths.chunks` as aliases pointing to the same resolved folder, vs. removing them in favor of a single `paths.plans`-relative rule) — implementation-level detail for Tech-Lead to settle in the governing Epic. | Tech-Lead |
