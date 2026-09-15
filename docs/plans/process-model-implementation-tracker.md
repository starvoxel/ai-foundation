# Process Model Implementation — Progress Tracker

> This is a **working checkpoint file**, not a target-model artifact. It exists so
> implementation of `docs/process-model.md` can pause and resume across sessions
> without re-deriving state. Delete it once Phase 16 / check 33 lands — git history
> is the permanent record, per the plan's own philosophy (`process-model.md` §
> Context rules).

## How this works

`docs/process-model.md` is the spec — this file never restates its content, only
tracks status against it. Each row below is one of the 34 numbered checks from that
document's **Implementation checks** table, grouped into the 16 phases from its
**Sequencing** section.

**Ground rules for this implementation pass:**

- **Direct execution, not the pipeline this plan replaces.** This work is done by a
  human + Claude Code working directly on the branch, not dispatched through
  Engineering-Manager → Software-Engineer → Principal-Engineer. Bootstrapping the new
  process through the old one it's busy retiring is circular; the human checkpoints
  below stand in for PE review.
- **One branch + one PR per phase, merged into this integration branch
  (`claude/process-model-implementation-plan-lty3ia`), not into `main`.** Branch name:
  `process-model/phase-N-{short-description}`, cut from the integration branch's
  current tip. The phase's check-implementing commits land on that branch; its last
  commit updates this tracker (check off boxes, fill in the commit SHAs and the
  Checkpoint note) so the PR's diff tells the whole story. **Claude opens the PR and
  stops — the human reviews and merges it**, same as any other PR in this repo
  (`steering/engineering/git-workflow-projects.md` Rule 13: no agent merges). Claude's
  own `npm test`/`npm run validate` pass is what makes a PR ready to hand off, not a
  license to merge it. This integration branch itself will PR into `main` once all 16
  phases are done (Phase 16 / check 33) — same rule applies there.
- **One commit per check** within a phase branch. Small, reviewable diffs, commit
  message references the check number (e.g. `process-model check 3: add
paths.architecture/paths.research`). If a check is bigger than expected, split it
  into multiple commits but keep them under that check's number — don't silently
  reorder or merge checks.
- **One human checkpoint per phase**, at minimum — reviewing the merged PR's diff and
  the tracker's Checkpoint note before the next phase's branch is cut. **Extra
  checkpoints on high-blast-radius phases:**
  - **Phase 7** (checks 11–13, skill deletion/re-homing) — pause after check 11
    (routing decided) before executing the deletions in check 12. If that pause is
    worth keeping across a PR boundary, check 11 can land as its own commit reviewed
    before check 12's commit is added to the same branch/PR.
  - **Phase 13** (checks 25–30, decision conversion) — pause after **check 25**
    specifically: it requires a human `Approved`/`Deferred` call on `ARCH-004`,
    `ARCH-007`, and `PROC-003` before any conversion proceeds. Pause again after the
    bulk rewrite (checks 27–28) before the indexer retarget (check 29).
- **Check 34 is out of scope for this tracker.** It's explicitly sequenced outside
  the 16 phases (an Architect-authored ADR on tooling, written later) — never mark it
  here.

## Resuming after a break

1. Read this file top to bottom.
2. `git log --oneline` on this branch and diff against the "Last commit" field below
   to confirm nothing drifted since the last update here. Also check for an open
   `process-model/phase-N-*` branch/PR that hasn't been merged yet — that's the
   in-progress phase, not a new one.
3. Continue at the first unchecked check, in phase order.
4. If a check's box is ticked but its commit SHA is blank, treat it as **not done** —
   re-verify before trusting the checkbox.

**Last commit at last tracker update:** `231de16` (`process-model/phase-4-agent-roster`)
**Current phase:** Phases 1–3 fully merged (PRs #35, #36, #38, #40). Phase 4
(check 6) implemented, validated, and open as PR #41 against the integration
branch — not yet merged. Several post-checkpoint refinements have landed on
that same branch/PR since (see Phase 4's post-checkpoint refinements note):
the review-skill split, old-roster framing cleanup, and the
`skill/complexity-tiers` rewrite that delivers most of check 13 early. Check
7 (Phase 5) has been added to `docs/process-model.md` as a spec but not yet
implemented — its agent-YAML work is still outstanding on this same branch.

---

## Phase 1 — Retire abandoned work (checks 1–2)

Branch: `process-model/phase-1-retire-abandoned-work`

- [x] **Check 1** — Tear down `AIF-003` (Epic + 8 chunk plans → `Deferred` + `archive/`).
      Commit: `0f1348d`. **Branch deletion still outstanding** — see checkpoint note.
- [x] **Check 2** — Mark `AIF-004` `Deferred`, move to `archive/`. Commit: `138dce0`.

**Checkpoint 1:** Both epics archived (`docs/plans/archive/AIF-003/`,
`docs/plans/archive/AIF-004.epic.md`), `npm test` 724/724 and `aif validate` clean.
Merged via PR #35. **Outstanding:** deleting the 5 stale remote branches named in
check 1 (`AIF-003/002-amendment-index-fields`, `AIF-003/006-plan-lifecycle-ladder-docs`,
`AIF-001/003-epic-planning-ai-track`, `AIF-002/010-migrate-aif-006`,
`AIF-002/015-backfill-decisions-index`) plus the now-merged
`process-model/phase-1-retire-abandoned-work` is blocked by the auto-mode
destructive-action classifier (retried twice, still refused). Verified all 5 first:
none merged into `origin/main` (`git branch -r --no-merged origin/main`), and PRs
#23/#24 (the two `AIF-003` branches) confirmed `closed`/`merged: false` via the GitHub
API. Needs a human to run the deletes (or grant permission):
`git push origin --delete <branch>` for each.

---

## Phase 2 — Config scaffolding (checks 3–4)

Branch: `process-model/phase-2-config-scaffolding`

- [x] **Check 3** — `.aiconfig.json` schema: `paths.features`/`paths.tasks`, add
      `paths.architecture`/`paths.research`, reserve `paths.product`; this repo's own
      `.aiconfig.json` + `AGENTS.md` field table updated. Commit: `e066376`.
      `resolveKnowledgePath`/`resolveDecisionsPath` in `lib/commands/index.js` checked
      and confirmed unaffected (neither reads `paths.epics`/`paths.chunks`, only the
      unchanged `paths.knowledge`/`paths.decisions` keys) — no code change needed
      there. `projects/_template/` and `lib/project-init.js`'s `buildAiConfig` are
      check 14's scope, not this one.
- [x] **Check 4** — `docs/architecture/` flat arc42 directory + section template;
      only §1/§2/§3/§5 created now (`01_introduction_and_goals.md`,
      `02_constraints.md`, `03_context.md`, `05_building_blocks.md`, plus
      `_template.md`). Commit: `2078c0e`.

**Checkpoint 2:** `npm test` 724/724 and `aif validate` clean after each commit.
Confirmed running the existing generic knowledge indexer (`aif index knowledge`)
against this repo silently skips the new arc42 files (no `type` frontmatter field)
rather than erroring — arc42-aware indexing is check 5's job. Merged via PR #36.

**Post-merge review pass (PR #38, `process-model/phase-2-fixup-goals-stakeholders`,
merged into #36's content):** the §1/§2/§3/§5 content got a full correctness pass
against arc42's actual official section definitions (fetched directly from
docs.arc42.org and cross-checked with user-provided reference PDFs), not just a
first-draft summary:

- §1: Goals table was restating `docs/process-model.md`'s own rework rationale
  instead of ai-foundation's product goals — replaced with real ones (portability,
  ease of use, minimal-dependency tooling), each with a measurable criterion;
  renamed Goals → Quality Goals; added the required Non-goals; Stakeholders fixed
  to human roles only (Project adopter / Framework maintainer — AI agent and
  Harness are §3 actors, not stakeholders).
- §2: added the missing Conventions category; reworded Node.js as primarily-Node,
  not Node-only (MCP servers under `servers/` may be non-Node, e.g. a third-party
  Python YouTrack MCP).
- §3: split into Business context / Technical context (arc42 keeps these separate);
  replaced the broken `C4Context`-notation diagram (renders garbled on GitHub —
  confirmed by screenshot) with a plain flowchart.
- §5: deep-reviewed the actual code (every export across `lib/`, `bin/`,
  `servers/`) and rewrote as a properly detailed whitebox with the required
  decomposition-motivation paragraph, plus two new white-box expansions —
  `05_01_bundle_resolution.md` and `05_02_harness_adapters.md` — each also given
  their own required motivation paragraph once checked against arc42's Level-2
  template (the same three-element template applies recursively).
- `docs/process-model.md` itself amended (checks 15/19): closed a real gap where
  staleness detection (checks 5/32) can never notice a _new_ file that should have
  been added to a `key_files` list but wasn't — now an explicit doc-update
  acceptance-gate/review-checklist item, since only a human/review step can catch
  that, not CI.

All fixes verified with `npm test`/`aif validate` at each step; merged via PR #38.

---

## Phase 3 — Index tooling (check 5)

Branch: `process-model/phase-3-index-tooling`

- [x] **Check 5** — `aif index architecture` (+ `--check`) added: new
      `lib/architecture.js` (mirrors `lib/decisions.js`'s pure/io split),
      generalized `entriesEqual` (decisions.js) reused for both doc sets,
      `stale` computed per-doc from `last_verified` vs. real git history of
      `key_files`, reverse index (`source path → [docs]`) built from
      `key_files`. Commit: `08b190d`.
      Docs updated to match (`05_building_blocks.md` gains the new block +
      `key_files`; `03_context.md` had an over-broad `lib/commands` directory
      entry removed after the new indexer caught it as a false-positive stale
      flag); `docs/architecture/index.json` generated for the first time and
      committed. Commit: `666e696`.
      **Follow-up fix:** `entriesEqual` living inside `decisions.js` meant
      `architecture.js` had to import from a same-level, unrelated domain
      module for a function that was already documented as generic and
      shared — decisions.js's own public API absorbing logic that isn't
      decision-record-specific. Extracted to a new `lib/index-diff.js`
      (no domain knowledge, just the structural-comparison primitive); both
      `decisions.js` and `architecture.js` now import it from there instead.

**Checkpoint 3:** 33 new tests (19 unit, 14 integration — the integration
suite spins up a real throwaway git repo to test staleness detection against
actual commit history). `npm test` 757/757, `aif validate`/`lint`/`typecheck`
all clean, `aif index architecture --check` passes against this repo's real
`docs/architecture/`. Two things worth flagging from actually dogfooding
this: (1) caught a real parsing bug before it shipped — a multi-line summary
blockquote (most of this repo's own arc42 docs use one) was silently
truncated to its first line; (2) caught a real over-broad `key_files` entry
in already-merged content (`lib/commands` as a whole directory in
`03_context.md`) the moment the tool was pointed at real data — exactly the
kind of drift check 15/19's new completeness rule exists to catch, just
demonstrated in the "too broad" direction rather than "missing entirely".

---

## Phase 4 — Agent roster (check 6)

- [x] **Check 6** — Agent YAMLs: retired `tech-lead`/`test-engineer`/
      `engineering-tech-writer`/`ai-engineer`; modified `architect`/`software-engineer`/
      `engineering-manager`/`principal-engineer`; added `engineering-researcher`. States
      explicitly which agent commits Architect's output. Commit: `8708a79`.

      Deliberately kept `skill/epic-planning`/`skill/chunk-planning`/`skill/chunk-orchestration`/`chunks.json` under their pre-rename names throughout the three affected agent prompts — checks 8-10 own that rename, not this check (per human decision during this session: "old names now, make wording in phase 5 extremely clear"). `docs/process-model.md`'s checks 6-9 cells now say so explicitly, including that `skills/epic-planning`, `skills/chunk-planning`, and `skills/chunk-orchestration` themselves are untouched and still describe the pre-roster world (literal Tech-Lead/AI-Engineer/Test-Engineer names, software/AI-track branching) — not just the check-6 agent YAMLs.

  **Also fold in while touching these files — done, all 5 items incorporated
  into the check-6 commit above:** (2026-09-13, a parallel session added
  these framework capabilities then reverted the `agents/*.yaml` grants themselves —
  net diff from our branch point is zero, confirmed via
  `git diff 29e6018 HEAD -- agents/` — deferring them explicitly to this check):
  - **`skill` tool → all 5 agents**, universal grant. Without it an agent has zero
    skill-catalog awareness on Claude Code (confirmed empirically in the deferred
    commit) — every one of the 5 still declares a `skills:` list, so all 5 need it.
  - **`plan` + `ask_user` → Architect and Engineering Manager only.** These are the
    two agents that interact with a human live in-session (Architect: human
    confirms the ADR before it's saved; Engineering Manager: absorbs Tech-Lead's
    PRD/request intake and Feature Plan approval gate — the prior grant was to
    Architect + Tech-Lead specifically). Do **not** grant to Software Engineer,
    Engineering Researcher, or Principal Engineer — background/gated-dispatch
    agents that surface blocks asynchronously (Tier 3 hand-off, PE findings),
    never via a live blocking question.
  - **`task` → all 5 agents**, broadly granted (was broad across all 8 before) as
    each agent's own session-scoped implementation checklist; `tasks.json` /
    `orchestration-state.json` stay the sole cross-harness source of truth.
  - **`preload_skills` → set per agent once its final `skills:` list is known**
    (depends on checks 8–13 landing content into each agent's skill list, so decide
    the actual subset at execution time, not now). Principle carried over from the
    deferred commit: `["*"]` for an agent with one small list used on effectively
    every dispatch (Principal-Engineer's code-review skill is the clear case);
    a named subset for an agent whose list mixes a universal skill with
    conditional/subsystem-specific ones (Engineering Manager: preload
    orchestration/worktree-management, leave Researcher-dispatch and any
    decision-hand-off skill on-demand; Software Engineer likely lands here too
    once it absorbs AI-Engineer's subsystem skills — preload only what runs on
    every Task, e.g. `complexity-tiers`).
  - `subagent` grants are unaffected — process-model.md's own Agent roster table
    (Subagent dispatch column) already specifies who holds it; the deferred commit
    only expanded which native tools it maps to (added `ListAgents`/`SendMessage`),
    not which agents hold it.
  - Kiro's adapter maps `skill`/`plan`/`ask_user`/`task` to `null` (no confirmed
    native equivalent) — already implemented in `lib/harnesses/kiro.js`, nothing
    to redo here.

**Checkpoint 4:** 732/732 tests passing (test-helpers.test.js fixtures updated
off the two deleted agent files it referenced), `aif validate`/`lint`/
`typecheck`/`format:check` clean, `bundles/engineering` snapshot regenerated
(46 sources — the new `skill/test-execution` reference on Software-Engineer
pulled in that skill's files), `aif index architecture|decisions --check` both
clean. Everything downstream derives from this — good place to slow down even
though it's a single check.

**Post-checkpoint refinements on the same branch/PR (#41), not new checks:**

- Extracted `skill/review-severity` (severity table, blocking rule, report
  template) out of `skill/code-review`; added `skill/ai-component-review`
  (previously an inline paragraph in Principal-Engineer's prompt). Both hand
  findings to `review-severity`. `principal-engineer.yaml` prompt shrinks
  accordingly. Commit: `0181aeb`.
- Stripped "Absorbs Tech-Lead"/historical-framing language from
  `engineering-manager.yaml`/`software-engineer.yaml`/`principal-engineer.yaml`
  descriptions and prompts — an agent shouldn't need to know or care what came
  before it; decision-record citations (e.g. `AIF-PROC-001`) kept since those
  are permanent, the retired-agent-name/superseded-plan-ID context around them
  is not. Commit: `ce9df0a`.
- Trimmed `software-engineer.yaml`'s inline restatement of
  `skill/complexity-tiers`'s generic Tier 1/2/3 definitions — first pass kept
  only SE's genuine deviations as prose (commit `231de16`), second pass moved
  even those into a new **Per-agent specifics** table in the skill itself
  (Tier 2 stop mechanism, Tier 3 hand-off destination), so SE's prompt now
  just points at its row instead of restating anything. This also delivers
  most of check 13's complexity-tiers scope early — see that check's note in
  Phase 7 below. Commit: `_____`.

---

## Phase 5 — PR/review flow (check 7)

- [ ] **Check 7** — Software-Engineer opens the Task's PR as a **draft**
      immediately after implementing, not after Principal-Engineer approval as
      today; Principal-Engineer's Review Report is posted onto that PR as real
      review comments/threads by **Engineering Manager** on its behalf
      (Principal-Engineer gains no `shell`/`gh`/`ai-git` access — same pattern
      as EM already committing an Architect-authored ADR). Correction loops
      happen on the same PR; Engineering Manager marks it ready-for-review once
      Principal-Engineer approves. **Spec-only so far** — `docs/process-model.md`
      updated with this check, the End-to-end flow diagram, the Agent roster
      table's Principal Engineer row, and a matching Resolved design question,
      plus the checks-7-33/phases-5-15 renumbering that made room for it.
      Commit: `66fa26d`. **The actual implementation (`engineering-manager.yaml`
      and `software-engineer.yaml` changes for the draft-open/post-review/undraft
      sequence) is still outstanding** — that's this check's real commit, not
      the plan edit above. Commit: `_____`

**Checkpoint 5:** _____

---

## Phase 6 — Vocabulary rename (checks 8–10)

- [ ] **Check 8** — `epic-planning` + `chunk-planning` → `feature-planning`. Commit: `_____`
- [ ] **Check 9** — `chunk-orchestration`: `chunks.json` → `tasks.json`, tier gate
      replaces per-Task plan, software/AI-track branching removed. Commit: `_____`
- [ ] **Check 10** — DAG server + `lib` renamed chunk→task, including doc comments
      and test fixtures in all three `servers/dag/tests/**` files. Commit: `_____`

**Checkpoint 6:** _____

---

## Phase 7 — Skill retirement & re-homing (checks 11–13)

- [ ] **Check 11** — Decide re-homing for what `knowledge-authoring` carried
      (steering rule + templates for MADR/arc42/external-reference). Commit: `_____`

**Mid-phase checkpoint (routing sign-off before deletions):** _____

- [ ] **Check 12** — Delete `decision-triage`, `decision-brief`, `decision-record`,
      `chunk-planning`, `ai-engineering-plan`, `knowledge-authoring`; all references
      removed; `docs/knowledge-file-format.md` rewritten or deleted, plus its
      referrers (`projects/_template/knowledge/example.md`, several `docs/plans/*.md`).
      Commit: `_____`
- [ ] **Check 13** — Trim `plan-lifecycle`/`complexity-tiers`; Tier 3 becomes
      stop-and-hand-off; `plan this` documented as a Tier 2 floor. **The
      `complexity-tiers` portion already landed early** as Phase 4 follow-on
      work (see that phase's post-checkpoint refinements note): Tier 3 now
      defaults to stop-and-hand-off, `plan this` is documented as a Tier 2
      floor not a Tier 3 jump, and a new Per-agent specifics table replaces
      per-agent prose. `plan-lifecycle`'s own trim is still outstanding — that
      remains this check's work. Commit: `_____`

**Checkpoint 7:** _____

---

## Phase 8 — Template alignment (check 14)

- [ ] **Check 14** — `projects/_template/` rebuilt on the full new layout (paths,
      `plans/{features,tasks,orchestration}/`, `knowledge/decisions/`,
      `knowledge/architecture/`, `knowledge/research/`, no `knowledge/product/`);
      `project-standards.md` references updated. Commit: `_____`

**Checkpoint 8:** _____

---

## Phase 9 — Steering & reference sweep (checks 15–17)

- [ ] **Check 15** — `steering/engineering/core.md` Rules 1/2/8/9 reworded;
      `knowledge-consumption.md` moves decisions to index-only by default; doc-update
      acceptance gate added. Commit: `_____`
- [ ] **Check 16** — Full vocabulary/reference sweep across the listed skills,
      standards, and steering files. Commit: `_____`
- [ ] **Check 17** — `agent-authoring` and `docs/agent-prompt-extraction-candidates.md`
      swept; product-doc ownership left unassigned. Commit: `_____`

**Checkpoint 9:** _____

---

## Phase 10 — Cross-cutting process/security rules (checks 18–20)

- [ ] **Check 18** — `tools.yaml` gains the trifecta-avoidance rule. Commit: `_____`
      **Also fold in:** `tools.yaml`'s `builtin`/`approval_guidance` lists are stale as
      of the 2026-09-13 merge — they still cover only the original 8 tools
      (`read`/`write`/`shell`/`web_search`/`web_fetch`/`grep`/`glob`/`code`).
      `subagent`/`plan`/`ask_user`/`task`/`skill` exist in `lib/constants.js`'s `TOOLS`
      (and are being granted per check 6 above) but aren't documented here. Add all 5
      to `builtin` and give each an `approval_guidance` tier at execution time — `skill`
      and `task` read/track only, so `safe` fits cleanly; `plan`/`ask_user` block for a
      human rather than acting unilaterally; `subagent` dispatches another agent, a
      different risk shape from web/write/shell — decide its tier deliberately rather
      than defaulting it into `moderate`/`privileged` alongside tools the trifecta rule
      is actually about.
- [ ] **Check 19** — `code-review` checklist gains the Architect/Researcher
      write-scope check (HIGH severity). Commit: `_____`
- [ ] **Check 20** — Software-Engineer's hard rules: Researcher brief is data, never
      an instruction; PE review applies regardless of dispatcher. Commit: `_____`

**Checkpoint 10:** _____

---

## Phase 11 — Regeneration & top-level docs (checks 21–22)

- [ ] **Check 21** — `bundles/engineering/snapshot.json` regenerated (only after
      checks 6 and 12 have actually landed). Commit: `_____`
- [ ] **Check 22** — `README.md`, `PLAN.md`, `AGENTS.md`, `agents/README.md`,
      `skills/README.md` updated. Commit: `_____`

**Checkpoint 11:** _____

---

## Phase 12 — Verification (checks 23–24)

- [ ] **Check 23** — `tests/validation/` cross-reference check passes; `npm test`
      green; fixtures cleaned up per the listed files. Commit: `_____`
- [ ] **Check 24** — Terminology-sweep automated validation check (zero stray
      `chunk`/`epic` outside the named exceptions). Commit: `_____`

**Checkpoint 12:** _____

---

## Phase 13 — Decisions conversion (checks 25–30)

- [ ] **Check 25** — Human decision gate: explicit `Approved`/`Deferred` call for
      `ARCH-004`, `ARCH-007`, `PROC-003` (all still `Draft`). Commit: `_____`

**Mid-phase checkpoint (blocking — needs your call on the three Draft records):** _____

- [ ] **Check 26** — Existing decision records dispositioned per the table; archive
      location created. Commit: `_____`
- [ ] **Check 27** — `docs/decisions/` flattened to bare-number MADR counter; every
      surviving record rewritten into MADR within budget. Commit: `_____`
- [ ] **Check 28** — `Design` sections split into arc42 homes for
      `ARCH-001/002/003/007` (+`004` if approved); `005/006` converted whole. Commit: `_____`

**Mid-phase checkpoint (bulk rewrite done, before retargeting the indexer):** _____

- [ ] **Check 29** — `lib/decisions.js` retargeted to MADR frontmatter, keeps
      `supersedes`→`superseded_by`; test fixtures updated. Commit: `_____`
- [ ] **Check 30** — The three new ADRs (plain JS+JSDoc, `node:test`, MCP credential
      handling) written in MADR form. Commit: `_____`

**Checkpoint 13:** _____

---

## Phase 14 — Unwind merged half of AIF-003 (check 31)

- [ ] **Check 31** — Revert `AIF-003-004`'s `Amending` status from
      `plan-lifecycle/reference/status-vocabulary.md` by hand (the other two merged
      chunks' effects already die with checks 12/29; `-005` is kept). Commit: `_____`

**Checkpoint 14:** _____

---

## Phase 15 — CI guards (check 32)

- [ ] **Check 32** — New guards in `.github/workflows/ci.yml`: staleness check,
      relative-link resolution across `docs/architecture`, `aif index decisions --check`.
      Commit: `_____`

**Checkpoint 15:** _____

---

## Phase 16 — Freeform plan triage (check 33)

- [ ] **Check 33** — Triage `docs/plans/*.md`: Done → `docs/plans/completed/`; real
      upcoming work → a Feature; process change → fold in + delete; stale → delete.
      Commit: `_____`

**Checkpoint 16 (final):** _____ — once this lands, delete this tracker file, then
open the PR merging this whole integration branch into `main`.

---

## Deferred, out of sequence

- **Check 34** — ADR tooling decision (Rust CLI vs. in-repo JS vs. staying manual).
  Written by Architect once there's hand-written MADR volume to judge by. Not part of
  this tracker's completion criteria; do not check off here.
