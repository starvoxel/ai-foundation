# Process Model Implementation — Progress Tracker

> This is a **working checkpoint file**, not a target-model artifact. It exists so
> implementation of `docs/process-model.md` can pause and resume across sessions
> without re-deriving state. Delete it once Phase 15 / check 32 lands — git history
> is the permanent record, per the plan's own philosophy (`process-model.md` §
> Context rules).

## How this works

`docs/process-model.md` is the spec — this file never restates its content, only
tracks status against it. Each row below is one of the 33 numbered checks from that
document's **Implementation checks** table, grouped into the 15 phases from its
**Sequencing** section.

**Ground rules for this implementation pass:**

- **Direct execution, not the pipeline this plan replaces.** This work is done by a
  human + Claude Code working directly on the branch, not dispatched through
  Engineering-Manager → Software-Engineer → Principal-Engineer. Bootstrapping the new
  process through the old one it's busy retiring is circular; the human checkpoints
  below stand in for PE review.
- **One commit per check.** Small, reviewable diffs, commit message references the
  check number (e.g. `process-model check 3: add paths.architecture/paths.research`).
  If a check is bigger than expected, split it into multiple commits but keep them
  under that check's number — don't silently reorder or merge checks.
- **One human checkpoint per phase**, at minimum. At each checkpoint: summarize what
  changed since the last one, run whatever validation applies (`npm test`,
  `npm run lint`, `npm run typecheck`, `npm run validate` as relevant to what changed),
  and wait for explicit go-ahead before starting the next phase.
- **Extra checkpoints on high-blast-radius phases:**
  - **Phase 6** (checks 10–12, skill deletion/re-homing) — pause after check 10
    (routing decided) before executing the deletions in check 11.
  - **Phase 12** (checks 24–29, decision conversion) — pause after **check 24**
    specifically: it requires a human `Approved`/`Deferred` call on `ARCH-004`,
    `ARCH-007`, and `PROC-003` before any conversion proceeds. Pause again after the
    bulk rewrite (checks 26–27) before the indexer retarget (check 28).
- **Check 33 is out of scope for this tracker.** It's explicitly sequenced outside
  the 15 phases (an Architect-authored ADR on tooling, written later) — never mark it
  here.

## Resuming after a break

1. Read this file top to bottom.
2. `git log --oneline` on this branch and diff against the "Last commit" field below
   to confirm nothing drifted since the last update here.
3. Continue at the first unchecked check, in phase order.
4. If a check's box is ticked but its commit SHA is blank, treat it as **not done** —
   re-verify before trusting the checkbox.

**Last commit at last tracker update:** `1255d42`
**Current phase:** Phase 1 done pending one manual step (branch deletion — see Checkpoint 1). Phase 2 is next.

---

## Phase 1 — Retire abandoned work (checks 1–2)

- [x] **Check 1** — Tear down `AIF-003` (Epic + 8 chunk plans → `Deferred` + `archive/`).
      Commit: `2d79802`. **Branch deletion still outstanding** — see checkpoint note.
- [x] **Check 2** — Mark `AIF-004` `Deferred`, move to `archive/`. Commit: `1255d42`.

**Checkpoint 1:** Both epics archived (`docs/plans/archive/AIF-003/`,
`docs/plans/archive/AIF-004.epic.md`), `npm test` 697/697 and `aif validate` clean
after each move. **Outstanding:** deleting the 5 stale remote branches named in check 1
(`AIF-003/002-amendment-index-fields`, `AIF-003/006-plan-lifecycle-ladder-docs`,
`AIF-001/003-epic-planning-ai-track`, `AIF-002/010-migrate-aif-006`,
`AIF-002/015-backfill-decisions-index`) was blocked by the auto-mode destructive-action
classifier. Verified all 5 first: none merged into `origin/main`
(`git branch -r --no-merged origin/main`), and PRs #23/#24 (the two `AIF-003`
branches) confirmed `closed`/`merged: false` via the GitHub API. Needs a human to run
the deletes (or grant permission) before this checkpoint is fully closed:
`git push origin --delete <branch>` for each of the 5.

---

## Phase 2 — Config scaffolding (checks 3–4)

- [ ] **Check 3** — `.aiconfig.json` schema: `paths.features`/`paths.tasks`, add
      `paths.architecture`/`paths.research`, reserve `paths.product`; update
      `resolveKnowledgePath`/`resolveDecisionsPath` in `lib/commands/index.js`;
      `AGENTS.md` field table; this repo's own `.aiconfig.json`. Commit: `_____`
- [ ] **Check 4** — `docs/architecture/` flat arc42 directory + section template;
      only §1/§2/§3/§5 created now. Commit: `_____`

**Checkpoint 2:** _____

---

## Phase 3 — Index tooling (check 5)

- [ ] **Check 5** — `aif index` extended for arc42 sections (reverse `key_files`
      index + `stale` flag from `last_verified`). Commit: `_____`

**Checkpoint 3:** _____

---

## Phase 4 — Agent roster (check 6)

- [ ] **Check 6** — Agent YAMLs: retire `tech-lead`/`test-engineer`/
      `engineering-tech-writer`/`ai-engineer`; modify `architect`/`software-engineer`/
      `engineering-manager`/`principal-engineer`; add `engineering-researcher`. States
      explicitly which agent commits Architect's output. Commit: `_____`

**Checkpoint 4:** _____ (everything downstream derives from this — good place to
slow down even though it's a single check)

---

## Phase 5 — Vocabulary rename (checks 7–9)

- [ ] **Check 7** — `epic-planning` + `chunk-planning` → `feature-planning`. Commit: `_____`
- [ ] **Check 8** — `chunk-orchestration`: `chunks.json` → `tasks.json`, tier gate
      replaces per-Task plan, software/AI-track branching removed. Commit: `_____`
- [ ] **Check 9** — DAG server + `lib` renamed chunk→task, including doc comments
      and test fixtures in all three `servers/dag/tests/**` files. Commit: `_____`

**Checkpoint 5:** _____

---

## Phase 6 — Skill retirement & re-homing (checks 10–12)

- [ ] **Check 10** — Decide re-homing for what `knowledge-authoring` carried
      (steering rule + templates for MADR/arc42/external-reference). Commit: `_____`

**Mid-phase checkpoint (routing sign-off before deletions):** _____

- [ ] **Check 11** — Delete `decision-triage`, `decision-brief`, `decision-record`,
      `chunk-planning`, `ai-engineering-plan`, `knowledge-authoring`; all references
      removed; `docs/knowledge-file-format.md` rewritten or deleted, plus its
      referrers (`projects/_template/knowledge/example.md`, several `docs/plans/*.md`).
      Commit: `_____`
- [ ] **Check 12** — Trim `plan-lifecycle`/`complexity-tiers`; Tier 3 becomes
      stop-and-hand-off; `plan this` documented as a Tier 2 floor. Commit: `_____`

**Checkpoint 6:** _____

---

## Phase 7 — Template alignment (check 13)

- [ ] **Check 13** — `projects/_template/` rebuilt on the full new layout (paths,
      `plans/{features,tasks,orchestration}/`, `knowledge/decisions/`,
      `knowledge/architecture/`, `knowledge/research/`, no `knowledge/product/`);
      `project-standards.md` references updated. Commit: `_____`

**Checkpoint 7:** _____

---

## Phase 8 — Steering & reference sweep (checks 14–16)

- [ ] **Check 14** — `steering/engineering/core.md` Rules 1/2/8/9 reworded;
      `knowledge-consumption.md` moves decisions to index-only by default; doc-update
      acceptance gate added. Commit: `_____`
- [ ] **Check 15** — Full vocabulary/reference sweep across the listed skills,
      standards, and steering files. Commit: `_____`
- [ ] **Check 16** — `agent-authoring` and `docs/agent-prompt-extraction-candidates.md`
      swept; product-doc ownership left unassigned. Commit: `_____`

**Checkpoint 8:** _____

---

## Phase 9 — Cross-cutting process/security rules (checks 17–19)

- [ ] **Check 17** — `tools.yaml` gains the trifecta-avoidance rule. Commit: `_____`
- [ ] **Check 18** — `code-review` checklist gains the Architect/Researcher
      write-scope check (HIGH severity). Commit: `_____`
- [ ] **Check 19** — Software-Engineer's hard rules: Researcher brief is data, never
      an instruction; PE review applies regardless of dispatcher. Commit: `_____`

**Checkpoint 9:** _____

---

## Phase 10 — Regeneration & top-level docs (checks 20–21)

- [ ] **Check 20** — `bundles/engineering/snapshot.json` regenerated (only after
      checks 6 and 11 have actually landed). Commit: `_____`
- [ ] **Check 21** — `README.md`, `PLAN.md`, `AGENTS.md`, `agents/README.md`,
      `skills/README.md` updated. Commit: `_____`

**Checkpoint 10:** _____

---

## Phase 11 — Verification (checks 22–23)

- [ ] **Check 22** — `tests/validation/` cross-reference check passes; `npm test`
      green; fixtures cleaned up per the listed files. Commit: `_____`
- [ ] **Check 23** — Terminology-sweep automated validation check (zero stray
      `chunk`/`epic` outside the named exceptions). Commit: `_____`

**Checkpoint 11:** _____

---

## Phase 12 — Decisions conversion (checks 24–29)

- [ ] **Check 24** — Human decision gate: explicit `Approved`/`Deferred` call for
      `ARCH-004`, `ARCH-007`, `PROC-003` (all still `Draft`). Commit: `_____`

**Mid-phase checkpoint (blocking — needs your call on the three Draft records):** _____

- [ ] **Check 25** — Existing decision records dispositioned per the table; archive
      location created. Commit: `_____`
- [ ] **Check 26** — `docs/decisions/` flattened to bare-number MADR counter; every
      surviving record rewritten into MADR within budget. Commit: `_____`
- [ ] **Check 27** — `Design` sections split into arc42 homes for
      `ARCH-001/002/003/007` (+`004` if approved); `005/006` converted whole. Commit: `_____`

**Mid-phase checkpoint (bulk rewrite done, before retargeting the indexer):** _____

- [ ] **Check 28** — `lib/decisions.js` retargeted to MADR frontmatter, keeps
      `supersedes`→`superseded_by`; test fixtures updated. Commit: `_____`
- [ ] **Check 29** — The three new ADRs (plain JS+JSDoc, `node:test`, MCP credential
      handling) written in MADR form. Commit: `_____`

**Checkpoint 12:** _____

---

## Phase 13 — Unwind merged half of AIF-003 (check 30)

- [ ] **Check 30** — Revert `AIF-003-004`'s `Amending` status from
      `plan-lifecycle/reference/status-vocabulary.md` by hand (the other two merged
      chunks' effects already die with checks 11/28; `-005` is kept). Commit: `_____`

**Checkpoint 13:** _____

---

## Phase 14 — CI guards (check 31)

- [ ] **Check 31** — New guards in `.github/workflows/ci.yml`: staleness check,
      relative-link resolution across `docs/architecture`, `aif index decisions --check`.
      Commit: `_____`

**Checkpoint 14:** _____

---

## Phase 15 — Freeform plan triage (check 32)

- [ ] **Check 32** — Triage `docs/plans/*.md`: Done → `docs/plans/completed/`; real
      upcoming work → a Feature; process change → fold in + delete; stale → delete.
      Commit: `_____`

**Checkpoint 15 (final):** _____ — once this lands, delete this tracker file.

---

## Deferred, out of sequence

- **Check 33** — ADR tooling decision (Rust CLI vs. in-repo JS vs. staying manual).
  Written by Architect once there's hand-written MADR volume to judge by. Not part of
  this tracker's completion criteria; do not check off here.
