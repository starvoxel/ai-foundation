# Chunk/Epic Planning Model Redesign

> Status: Draft
> Created: 2026-08-19
> Approved by: Pending

---

## Step 1 Findings (verification, not part of the design)

The task listed a set of "missing" paths and asked me to verify before designing. Verified result: **all listed paths exist in this repo** (`ai-foundation`, the source-of-truth framework repo), with proper `reference/`/`assets/` subdirectories under `skills/`, and `.aiconfig.json` exists at repo root. The claim that these are missing applies only to the **installed** copy at `C:\Users\Jeremy\.claude\`, which is flat (no `reference/`/`assets/` subdirectories under `skills/`).

Root cause of that flatness, verified by reading the install code: `lib/harnesses/claude.js`'s `getSkillSources()` copies only the single `SKILL.md` file to a flat target (`skills/{name}.md`) and never copies `reference/`/`assets/` subdirectories or preserves the folder structure. `lib/harnesses/kiro.js`'s `getSkillSources()` already does this correctly, using the shared `collectFiles()` helper in `lib/harnesses/base.js` to copy the full directory tree to `skills/{name}/`. This is a real, separate packaging defect — not a symptom of anything this redesign changes. Sizing and disposition are addressed in Open Question 5.

This finding changes the framing of Step 4's prerequisite concern: `plan-lifecycle` and `.aiconfig.json` are **not** missing from the framework and do **not** need to be created as a prerequisite. The redesign below proceeds directly against the source repo.

---

## Goal

Replace the current 14-section, individually-approved Chunk Plan and its dedicated SE→TE→PE relay for every chunk with a lightweight chunk work item embedded in `chunks.json`, approved once as part of the epic's decomposition. Apply `complexity-tiers` to chunks so trivial chunks skip the full review relay. Move security review criteria and a real, gating test plan up to the epic level, written and approved before any chunk implementation begins. Preserve the wave-based concurrency machinery (`chunks.json`, `dag-compute-waves`, worktrees) unchanged.

---

## Components Affected

| Component | Action | Notes |
|---|---|---|
| `skills/chunk-planning/SKILL.md` | Remove | Responsibility absorbed into `epic-planning` Step 5 (see Approach Step 1). No standalone chunk-plan document or gate remains. |
| `skills/chunk-planning/reference/template.md` | Remove | Template content (goal, files, acceptance criteria) becomes the schema for a `chunks.json` chunk object instead. |
| `skills/epic-planning/SKILL.md` | Modify | Merge decomposition into the drafting phase (before the gate), add Epic Test Plan and revise Security Considerations guidance, add tier assignment to Step 5. |
| `skills/epic-planning/reference/template.md` | Modify | Rewrite Section 7 (Security Considerations) guidance, insert new Section 9 (Epic Test Plan), renumber Chunk Decomposition/Acceptance Criteria/Work Log. |
| `skills/epic-planning/reference/chunks-schema.md` | Modify | Add `goal`, `files`, `acceptance_criteria`, `tier`, `high_risk` fields to the chunk object schema. |
| `skills/epic-planning/assets/chunks.json` | Modify | Add placeholder fields for the new chunk object schema. |
| `skills/chunk-orchestration/SKILL.md` | Modify | Step 1 (gate description), Step 2/3 (tier-based dispatch — Tier 1 skips TE/PE), Step 6 (real completion gate running the Epic Test Plan), edge case on single-chunk epics. |
| `skills/test-execution/SKILL.md` | Modify | Inputs/Step 1 rewritten to two modes: chunk-level (derived from work item acceptance criteria + relevant Epic Test Plan scenarios) and epic-level acceptance run (full Epic Test Plan). |
| `skills/plan-lifecycle/reference/status-vocabulary.md` | Modify | Remove Chunk Plan as an independently-gated artifact type; note its fields now live inside `chunks.json`, gated by the Epic Plan's `Status`. |
| `steering/engineering/core.md` | Modify | Rule 1 (governing plan is now the Epic Plan, not a Chunk Plan), Rule 8 (drop Chunk Plan from the list of independently-gated artifacts), Rule 9 (checkpoint language: "chunk work item" instead of "Chunk Plan's task list"). |
| `steering/engineering/git-workflow-framework.md` | Modify | Rule 3 wording ("governing plan" → epic-level). |
| `steering/engineering/git-workflow-projects.md` | Modify | Rule 1/2 wording (same). |
| `tests/validation/` | Modify | Add a cross-reference check that skill-to-skill references (`skill/{name}`) and literal `reference/`/`assets/` paths cited in SKILL.md files resolve to real files/folders — would have caught the packaging bug in Step 1. |
| `lib/harnesses/claude.js` | None (out of scope) | See Open Question 5. Not touched by this plan. |

---

## Approach

### Step 1 — Retire `chunk-planning`, extend `chunks.json` schema

Fold the chunk work-item definition into `epic-planning` Step 5 and the `chunks.json` schema. Remove `skills/chunk-planning/` entirely (SKILL.md + reference/template.md). Extend the chunk object schema in `chunks-schema.md` and `assets/chunks.json` with:

- `goal` (string) — one paragraph
- `files` (string[]) — files/components touched
- `acceptance_criteria` (string[], 3–5 items)
- `tier` (number, 1|2|3) — from `skill/complexity-tiers`, assigned by Tech-Lead at decomposition time
- `high_risk` (boolean, default false) — manual override; forces the full SE→TE→PE relay regardless of `tier`. Tech-Lead sets this when a chunk's `files`/scope intersects the epic's Security Considerations (Section 7).

Existing fields (`id`, `title`, `depends_on`, `agents`) are unchanged. Update the worked example in `chunks-schema.md`.

### Step 2 — Reorder epic-planning: decompose before the gate

Merge what is currently Step 5 ("Decompose into Chunks", post-approval) into Step 3 ("Write Epic Plan", pre-approval). The epic author drafts both the Epic Plan document and `chunks.json` together, runs `dag-validate`, then the single Draft→Approved commit-gate (Step 4, unchanged mechanics from `skill/plan-lifecycle`) covers both artifacts as one package. See Open Question 1 — this is the recommended resolution, not an unstated assumption; flagging it because it reorders an existing skill's step sequence.

### Step 3 — Epic Test Plan (new Section 9)

Add a new Section 9 to the epic template, inserted before the (renumbered) Chunk Decomposition section, with four required subsections:

- **Feature verification** — one row per feature in Section 5, table: `Feature | Scenario (observable behaviour) | Automated? | Test Case ID`
- **Integration points** — table: `Boundary (chunks involved) | What crosses it | Verification approach`
- **Regression scope** — table: `Existing area at risk | Why this epic endangers it | Verification approach`. "Run the test suite" alone is not acceptable content — must name actual areas.
- **Sign-off** — table: `Item | Validator (role) | When (gate point)`

Automatable rows use the same `Test ID | Description | Type | Pass Criteria` shape as the current chunk Testing Plan table, so `test-execution` can consume them directly. Manual-only rows are limited to checks that genuinely require human judgement (e.g. visual/UX review) — state why automation isn't possible.

This section is written and approved at epic-gate time, per the same Draft→Approved commit as the rest of the epic — never written after implementation.

### Step 4 — Epic Security Considerations (rewrite Section 7)

Rewrite Section 7 guidance: covers only what is specific to this feature — trust boundaries crossed, sensitive data introduced/moved, authz decisions, new attack surface. General rules already in standards files are not restated. "No epic-specific considerations beyond the standards" is explicitly documented as a valid, complete answer. Whatever is written becomes a named review criterion: chunks whose `files` intersect a named concern should be marked `high_risk: true` (Step 1) so they get full PE review against that concern specifically, not just the general standards checklist.

### Step 5 — Tier-based chunk-orchestration dispatch

Update `chunk-orchestration.md`:

- **Step 1** — gate description updated: the Epic being `Approved` now covers both the epic document and `chunks.json` (per Step 2 above) as one package; no separate per-chunk approval check remains.
- **Step 2 (Dispatch Wave)** — drop the per-chunk "verify chunk plan Approved" check (no longer applies). Dispatch reads each chunk's `tier`/`high_risk` from `chunks.json` to decide pipeline shape.
- **Step 3 (Monitor Pipeline)** — branch by tier:
  - **Tier 1, not high_risk:** SE implements, self-validates (runs tests, verifies cross-references per `complexity-tiers` Tier 1 process), commits, and creates the PR directly. No TE or PE dispatch. Status transitions `Ready → Implementing → Done`.
  - **Tier 2/3 or `high_risk: true`:** unchanged full SE → TE → PE relay as documented today.
- **Edge case update** — replace "Epic has only one chunk — still follow the full pipeline. No shortcuts" with: pipeline shape is always determined by the chunk's `tier`/`high_risk`, independent of how many chunks are in the epic.
- **Step 6 (Complete)** — becomes a real gate, not just a summary (Step 6 below has the detail).

### Step 6 — Wire the Epic Test Plan into Step 6 as a real gate

Rewrite `chunk-orchestration.md` Step 6: once all chunks are `Done`, dispatch a Test-Engineer subagent in epic-acceptance mode (Step 7) to execute every automatable scenario in the Epic Test Plan (Section 9) against the merged result. Manual sign-off items are presented to the human per the Sign-off table. The epic cannot be set to `Complete` while any automated scenario fails or any required manual sign-off is outstanding — failures/outstanding sign-offs are logged as blocking findings and the epic stays `Blocked`/`In Progress` until resolved. Only once all pass/sign-off is recorded does Step 6 set overall status `Complete` and produce the summary.

### Step 7 — Two-mode test-execution

Rewrite `test-execution.md` Inputs and Step 1:

- **Chunk-level mode** (used within the SE→TE→PE relay for Tier 2/3/high_risk chunks): source test cases from the chunk's `acceptance_criteria` (in `chunks.json`) plus any Epic Test Plan Feature-verification/Integration-point rows whose scope touches this chunk's `files`.
- **Epic-acceptance mode** (used by chunk-orchestration Step 6): source test cases from the full Epic Test Plan (Section 9) — all automatable Feature verification, Integration points, and Regression scope rows.

Both modes reuse the existing Test Results Report template and category structure (unit/integration/validation) unchanged.

### Step 8 — Steering and status-vocabulary updates

- `engineering-core.md` Rule 1: replace "a Chunk Plan exists and has been approved" with "the parent Epic Plan (including its chunk decomposition) has been approved." Rule 8: remove "Chunk Plan" from the list of independently-gated artifact types (now: Epic Plan, Decision Record, Tier 3 plan). Rule 9: replace "per completed task in a Chunk Plan's task list" with "per completed chunk work item, or per logical step within one."
- `git-workflow-framework.md` Rule 3 and `git-workflow-projects.md` Rules 1–2: replace "governing plan" language that implies a Chunk Plan with epic-level language, consistent with Rule 1 above.
- `plan-lifecycle/reference/status-vocabulary.md`: remove the "Chunk Plan" row from the per-artifact-type table; add a note that chunk work items are fields inside `chunks.json`, governed by the parent Epic Plan's `Status`, not an independent artifact.

### Step 9 — Cross-reference validation test

Add a validation test (new file or extend `tests/validation/schemas.test.js`) that, for every `skills/{name}/SKILL.md`: (a) resolves every `skill/{other}` reference to a real `skills/{other}/` folder, and (b) resolves every literal `reference/...` or `assets/...` path mentioned in the file to a real file relative to that skill's folder. This is the mechanism that would have caught the packaging gap found in Step 1 (had it existed and been run against the source repo — it was never a source-repo problem, but the check itself is a legitimate gap in `tests/validation/` today).

---

## Open Questions

1. **Decomposition ordering (Step 2 above).** Recommended: merge decomposition into the pre-gate drafting phase so one commit-gate covers both the Epic Plan and `chunks.json`. Alternative: keep the current post-approval ordering and separately define what "approved" means for a `chunks.json` produced after the gate already closed. Needs explicit confirmation since it reorders an existing skill's step sequence.
2. **`chunk-planning` retirement.** Recommended: remove it entirely and fold its responsibility into `epic-planning` Step 5 (Step 1 above), since there is no longer a standalone document or gate for it to produce. Alternative: keep it as a thin, ungated helper skill invoked by `epic-planning`. Low-stakes but affects file layout — flagging rather than deciding unilaterally.
3. **Auto-escalation to `high_risk`.** Recommended: manual — Tech-Lead sets `high_risk: true` at decomposition time, instructed to check each chunk's `files` against Section 7 (Security Considerations). Alternative: automate the intersection check in `chunk-orchestration` Step 2 (compare `files` against a structured list of security-relevant paths in Section 7) rather than trusting manual tagging. Automating is more robust but requires Section 7 to be machine-parseable, which adds structure the task didn't ask for.
4. **Migration of in-flight work.** Recommended: grandfather existing `Approved`/`Done` Chunk Plans (e.g. under `AIF-001`, `AIF-002`) as-is; the new schema applies only to epics decomposed after this plan is implemented. No retroactive migration.
5. **Packaging bug disposition (Step 1 finding).** The `lib/harnesses/claude.js` `getSkillSources()` flattening bug is real but unrelated to this redesign. Sizing: **small** — a working reference implementation already exists in `kiro.js` using the shared `collectFiles()` helper in `base.js`; the fix is swapping `claude.js`'s hardcoded single-file source for the same pattern, changing the flat target (`skills/{name}.md`) to a directory target (`skills/{name}/SKILL.md`), auditing any other code that assumes the flat path (uninstall, snapshot hashing), and extending `tests/integration/install-claude.test.js`. Rough estimate: half a day, no architectural decision required. Recommend filing as a separate Tier 1/2 fix, independent of and not blocking this redesign.

## Risks

- **Reordering epic-planning's steps (Step 2) could be revisited by the human** as premature detail work before approval, defeating the "epic stays high-level" principle in the current skill (`Section 6 stays high-level — no method signatures`). Mitigation: work-item fields are deliberately shallow (goal/files/acceptance criteria, no interfaces/signatures), so this shouldn't reintroduce the ceremony being removed — but it's a genuine trade-off worth the human weighing in on via Open Question 1.
- **Removing the per-chunk approval gate removes a checkpoint** where a human could catch a bad chunk boundary before implementation starts. Mitigation: the epic-level gate now covers the full decomposition (all chunks at once) rather than nothing, so the checkpoint moves rather than disappears — but it is coarser-grained.
- **Tier assignment quality depends on the Tech-Lead agent's judgement at decomposition time**, done once for the whole epic rather than reassessed per chunk as work starts. Mitigation: `chunk-orchestration` Edge Cases already require stopping and escalating if complexity turns out higher than assessed mid-implementation (per `complexity-tiers` Step 5) — this still applies per chunk.

## Validation

- Run `npm test` (full suite) after implementation — no regressions in `tests/unit/`, `tests/integration/`, `tests/validation/`.
- New/extended `tests/validation/` cross-reference test (Step 9) passes against the updated skill set.
- Manually re-read every edited file together (`epic-planning`, `chunk-orchestration`, `test-execution`, `engineering-core`, both git-workflow files, `plan-lifecycle`/status-vocabulary, `chunks-schema.md`) to confirm consistent terminology and that no file still references the retired `chunk-planning` skill or a per-chunk approval gate.
- Confirm `skills/epic-planning/assets/chunks.json` and the worked example in `chunks-schema.md` both reflect every new field.
- Confirm `dag-validate`/`dag-compute-waves` server tool contracts are untouched (concurrency machinery preserved unchanged, per the task's constraint).

## Out of Scope

- Fixing the `lib/harnesses/claude.js` skill-install flattening bug (Open Question 5) — separate piece of work.
- Migrating already-`Approved`/`Done` chunks under existing epics (`AIF-001`, `AIF-002`) to the new schema (Open Question 4).
- Any change to `worktree-management`, or to the `dag-validate`/`dag-compute-waves` server tool implementations themselves.
- Redesigning the Principal-Engineer review process beyond wiring Epic Security Considerations in as a named criterion.
- `decision-record`, `knowledge-authoring`, `code-review` skills — unaffected by this redesign.
