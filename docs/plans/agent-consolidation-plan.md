# Agent Consolidation Plan

> Status: Superseded
> Created: 2026-09-09
> Approved by: Pending
> Superseded by: `docs/process-model.md` (2026-09-09) — merged in as its "Agent roster" section
> plus updates to Existing artifacts, Implementation checks, and Sequencing. Kept here as
> a historical record; do not edit further. See `docs/process-model.md` for the live version.

Target-state redesign of the engineering agent roster, moving from an 8-agent
role-pipeline (architect / tech-lead / engineering-manager / software-engineer /
ai-engineer / test-engineer / principal-engineer / engineering-tech-writer) to a
5-agent model where one agent owns a task end-to-end (design → implement → test →
document), isolating only research (privilege/context reasons) and review
(blackbox verification) into separate agents. Based on external research into
token-efficient multi-agent architecture (Anthropic's context-centric
decomposition guidance) plus a security pass on tool/network privilege per agent.

---

## Why

Anthropic's own findings on multi-agent systems: splitting by pipeline role
(planner/implementer/tester/reviewer) creates coordination overhead that
regularly exceeds the token cost of the actual work, because each handoff loses
context — the tester doesn't know why the implementer made its choices, the
reviewer doesn't have the exploration history. The fix is context-centric, not
role-centric, decomposition: one agent owns a feature/task through design,
implementation, and documentation, in one continuous session. Split into a
separate agent only when a sub-task has genuinely different privilege/network
needs, generates high-volume context that's irrelevant once distilled (research),
or is a true blackbox check (verification).

This repo's current roster is close to a textbook instance of the anti-pattern:
`Software-Engineer → Test-Engineer → Principal-Engineer`, with review loops
capped at 5 iterations and the full three-agent chain restarting on any
conflict or rejected review — plus `Tech-Lead` and `Engineering-Manager` further
splitting planning/decomposition/dispatch by job title on top of that.

A second, independent issue surfaced during the audit: two current agents
(`architect`, `ai-engineer`) hold the full "lethal trifecta" — repo write
access, exposure to untrusted web content, and shell/code execution —
simultaneously. This plan closes that alongside the pipeline consolidation.

---

## Target roster

| Agent | Domain role | Write | Shell | Web | Subagent dispatch |
|---|---|---|---|---|---|
| **Architect** | ADRs only — rare, contested, costly-to-reverse forks | Yes, scoped to `docs/decisions/**` | **No** | Yes (`web_search`/`web_fetch`) | Callable as a subagent by EM |
| **Engineering Manager** | Absorbs Tech-Lead: PRD/request → technical outline → task decomposition → dispatch → orchestration | Yes (plans, orchestration state) | Yes (`ai-git`, dag tools) | **No** | Dispatches SE, Architect (decision hand-off), Researcher |
| **Software Engineer** | Absorbs Test-Engineer + Engineering-Tech-Writer + AI-Engineer + chunk-level design (part of old Tech-Lead). Handles both product code and AI-component work (agents/skills/steering/servers/bundles), loading whichever skill set the task calls for. | Yes | Yes | **No** | Gated `subagent` → Researcher (not in `approved_tools`, human confirms each dispatch) |
| **Engineering Researcher** *(new)* | Web research → decision-ready brief, for SE/EM | Yes, scoped to a notes/scratch path (`.md` only) | **No** | Yes | No |
| **Principal Engineer** | Review gate — standards + the feature's outline, not full implementation history | No (findings only) | No | No | No |

Net: 8 agents → 5. `Tech-Lead`, `Test-Engineer`, `Engineering-Tech-Writer`, and
`AI-Engineer` are retired as standalone agents; their charters are absorbed
above.

### Why AI-Engineer merges into Software-Engineer rather than staying separate

None of the doc's four reasons to split into a separate agent apply between
AI-Engineer and Software-Engineer once both have the same privilege profile
(write + shell, no web): no context-volume reason (same task shape either way),
no privilege/network difference (identical in this model), not a verification
role, and parallelism is achieved by dispatching multiple concurrent instances
of the same agent definition, not by having two different agent identities. The
split was a job-title boundary, not a genuine isolation boundary. Merging also
removes the one place the old roster had a real coordination cost: a change
spanning both the bundle-resolver code (`lib/`) and a bundle definition
(`bundles/*/bundle.yaml`) used to need two agents; one merged engineer now does
it as a single task.

`AIF-PROC-001`'s underlying code/declarative-artifact boundary (`lib/`+`bin/`
vs. `agents/`+`skills/`+`steering/`+`servers/`+`bundles/`) is unaffected — same
directories, same test categories (`tests/unit`+`tests/integration` vs.
`tests/validation`), just one agent instead of two applying the right one per
task.

### Why Principal-Engineer absorbs AI-component review rather than a new "Principal AI Engineer"

Same reasoning: a reviewer needing to apply either "standards + code
correctness" or "AGENTS.md schema + cross-reference integrity" per diff is no
different from it already needing multiple language standards. One reviewer,
branching its checklist by artifact type — not a second reviewer role.

### Security: net trifecta posture after this change

| Agent | Legs held | Residual risk |
|---|---|---|
| Architect | write + web, no shell | Confirm the web tool is read-only fetch, not a generic HTTP client with outbound POST |
| Engineering Manager | write + shell, no web | Clean — only ever sees compressed briefs from Architect/Researcher, never raw content |
| Software Engineer | write + shell, no web | Clean — research need routes through gated Researcher dispatch |
| Engineering Researcher | web only, write scoped to non-executable `.md` output | Clean — the one agent allowed to hold the web leg freely holds nothing else |
| Principal Engineer | none | Clean |

Compare to today: `architect` and `ai-engineer` each currently hold all three
legs at once (write + shell + `web_search`/`web_fetch`), mitigated only by a
per-call human-confirmation gate (`approved_tools` exclusion) rather than a
structural boundary.

---

## End-to-end flow

```
PRD / human request
      |
      v
Engineering Manager -- needs research/decision? --> Architect (subagent, gated)
  writes Feature-level                                  writes ADR, human approves
  technical outline
      | human approves outline
      v
  dispatch per Task ------------------------------------
      |
      +--> Software Engineer -- needs research? --> Engineering Researcher (gated subagent)
      |      design -> implement -> test -> inline docs   returns brief, no code/repo write
      |      (single continuous session, own worktree)
      v
  Principal Engineer (standards + Feature outline, not full implementation history)
      |
      +-- APPROVED -> EM merges/advances
      +-- NEEDS_CHANGES -> back to the same implementing agent (no cross-agent handoff/restart)
```

Correction loops and merge-conflict resolution now cycle within one agent
instead of restarting a three-agent chain — the largest single source of the
old model's coordination overhead.

---

## Resolved design questions

**How detailed should EM's technical outline be, going into a Task?**
Coarse — *what*, not *how*: goal/acceptance criteria, interface/contract
boundaries the task owns vs. depends on, binding standards and already-Approved
ADRs, non-functional requirements as an explicit checklist (security, logging,
perf — still a PE gate), and explicit out-of-scope. Not function-level design,
not a prescribed test list, not a file-by-file breakdown — that detail is
Software-Engineer's own design step, done at the top of its own session, not
handed to it pre-chewed. This is a deliberate trade-off: the pre-implementation
human checkpoint moves from "approve a detailed Chunk Plan" to "approve EM's
coarser outline," and design-level mistakes are now caught at PE review instead
of before code is written. That's the intended effect of single-agent
consolidation, not an oversight.

**Should Software-Engineer still need a pre-approved plan before every task?**
No — replace the blanket gate with the `complexity-tiers` skill (already built,
currently wired only to `ai-engineer.yaml`): Tier 1/2 proceeds directly,
self-validated, no separate plan artifact; Tier 3 ("cross-cutting, new
conventions, reshapes how other components work") stops and escalates back to
Engineering Manager to become (or fold into) a Feature — matching the
disposition `docs/process-model.md` already recorded for retiring
`ai-engineering-plan` ("Tier 1/2 via `complexity-tiers`; larger becomes a
Feature"). This *is* the "refuse if too large / needs too much research" carve-
out: it already exists in the framework, it just needs to become
Software-Engineer's universal front door instead of a parallel AI-only case.

**Should Engineering Manager pick up any other responsibilities?**
Yes, two: (1) gate its own `subagent` dispatch to Researcher the same way it
already gates dispatch to Architect, so light lookups feeding a Feature outline
don't have to escalate all the way to an ADR; (2) `skill/code-review` gains an
explicit rule that any diff touching `tools`/`approved_tools`/`blocked_commands`
in an agent definition is always HIGH-or-above severity — this is what makes
Software-Engineer's (post-merge) write access to `agents/*.yaml` safe: the
write is inert until it clears PE review and a human-merged PR, and PE needs to
actually be scrutinizing that class of diff for the gate to hold.

---

## Master change checklist

### Agent definitions (`agents/*.yaml`)
- [ ] `architect.yaml` — drop `shell`; scope `write` to `docs/decisions/**`
- [ ] `engineering-manager.yaml` — absorb `tech-lead`'s charter; add gated `subagent` → Researcher
- [ ] `tech-lead.yaml` — retire (folded into `engineering-manager.yaml`)
- [ ] `software-engineer.yaml` — absorb `test-engineer` + `engineering-tech-writer` + `ai-engineer`; add gated `subagent` → Researcher; drop any web tools
- [ ] `test-engineer.yaml` — retire (folded into `software-engineer.yaml`)
- [ ] `engineering-tech-writer.yaml` — retire (folded into `software-engineer.yaml`)
- [ ] `ai-engineer.yaml` — retire (folded into `software-engineer.yaml`)
- [ ] `principal-engineer.yaml` — expand `skill/code-review` scope to declarative-component review; add tool-grant-diff elevated-scrutiny rule
- [ ] `engineering-researcher.yaml` — new: web tools, no shell, write scoped to a notes/scratch path, no `git`/`gh` capability

### Skills
- [ ] `epic-planning` + `chunk-planning` — merge into EM's Feature-level outline skill
- [ ] `ai-engineering-plan` — retire per existing `docs/process-model.md` disposition (Tier 1/2 via `complexity-tiers`; Tier 3 escalates to a Feature, no separate plan artifact)
- [ ] `complexity-tiers` — re-point as Software-Engineer's primary gate (currently referenced only by `ai-engineer.yaml`)
- [ ] `chunk-orchestration` — drop software-track/AI-track branching (Steps 2-3); one pipeline shape (implement+self-test+docs → PE)
- [ ] `decision-triage` (`reference/tier-and-domain.md`) — remap domain owners: PLAN → Engineering-Manager, AIC → Software-Engineer, TEST → fold into QA (Principal-Engineer) or Software-Engineer (needs a deliberate call)
- [ ] `decision-record` (`reference/domain-guidance.md`) — mirror the same owner remap (source of truth is `AIF-META-001`, needs its own amendment)
- [ ] `decision-brief` — check for owner-name references
- [ ] `plan-lifecycle` (`reference/status-vocabulary.md`) — collapse artifact-type table (Chunk Plan / Epic Plan / Tier 3 `ai-engineering-plan` → Feature Plan only)
- [ ] `worktree-management` — light terminology pass, confirm no stale track-specific wording
- [ ] `skill/agent-authoring` — re-check `docs/agent-prompt-extraction-candidates.md` checkpoint now that most of its tracked candidates move owner or become moot
- [ ] Optional: light `engineering-researcher` skill (or keep it prompt-only) defining "return a decision-ready brief, cite sources, never raw dumps"

### Steering
- [ ] `steering/engineering/core.md` Rule 1 — replace blanket "approved Chunk Plan required" with the `complexity-tiers` gate
- [ ] Rule 2 — add fallback for Tier 1/2 work with no formal plan artifact (precedent: AI-track's existing "no written plan needed" determination)
- [ ] Rules 4/5/8/9 — "parent Epic"/"Chunk Plan"/"Epic Plan" wording → Feature Plan terminology
- [ ] `git-workflow-framework.md` / `git-workflow-projects.md` — verify no stale agent/track references (not fully audited yet)

### Standards / servers
- [ ] No structural change identified; confirm no stack standard assumes a Test-Engineer/Software-Engineer split

### Bundles
- [ ] `bundles/engineering/bundle.yaml` — no edit needed (pure `domain: engineering` auto-discovery absorbs the roster shrink automatically)
- [ ] `bundles/engineering/snapshot.json` — regenerate after agent files change (generated artifact, not hand-edited)

### Tooling / schema
- [ ] `skills/agent-authoring/reference/tools.yaml` — add an explicit rule against holding `moderate` (web) and `privileged` (write/shell) tools simultaneously without documented isolation justification
- [ ] `tests/validation/schemas.test.js` / `tools.test.js` — schema-generic, should pass unchanged against the new roster; verify after the fact
- [ ] `lib/resolver.js`, `lib/constants.js` — doc-comment examples only (`@example "architect.yaml"`), cosmetic pass
- [ ] Test fixtures referencing old agent names as example data (`tests/unit/decisions.test.js`, `tests/integration/decisions-index.test.js`, `knowledge-index.test.js`, `base.test.js`, `claude-adapter.test.js`, `kiro-adapter.test.js`) — low-risk cosmetic pass

### Documentation
- [ ] `AGENTS.md` — pass for any agent-specific prose beyond the already-roster-agnostic component/loading-rules sections
- [ ] `agents/README.md`, `skills/README.md`, `servers/README.md`, `standards/README.md` — human-reference only, update to reflect new roster
- [ ] Root `README.md`, `PLAN.md` — reference old agent names, need a pass
- [ ] `install.ps1` — enumerates agent files for install; remove retired names (real code change, not just prose)
- [ ] `docs/agent-prompt-extraction-candidates.md` — resolve/reassign tracked candidates whose originating agents merge

### Decision records (legacy flags only — not a redesign of ADR process)
- [ ] `AIF-PROC-001` (AI-Engineer/SE code boundary) — superseded by the merge
- [ ] `AIF-PROC-002` (AI-track orchestration dispatch), `AIF-PROC-006` (AI-track chunk decomposition ownership) — superseded by dropping the track distinction
- [ ] `AIF-META-001` (decision-record tiering and domain ownership) — needs the same owner remap as its two `reference/*.md` mirrors
- [ ] `AIF-PROC-004`, `AIF-PROC-005` — flagged by grep, content not yet confirmed; check during implementation
- [ ] `AIF-ARCH-005`, `AIF-ARCH-006` — unaffected, no agent-identity dependency

---

## Relationship to `docs/process-model.md`

This plan and `docs/process-model.md` (the in-flight "efficiency rework": Epic→
Feature/Task rename, decision-record tier trimming, reference-doc structure)
touch overlapping files — `chunk-orchestration`, `epic-planning`,
`chunk-planning`, the decision-record tier tables, and the agent-charter table.
`process-model.md`'s existing "Agent changes" section does not address agent
count or pipeline-role consolidation at all. These should be merged into one
document rather than run as two sweeps over the same files.

---

## Suggested sequencing

1. Agent YAML changes (retire 4, modify 4, add 1) — everything else derives from this.
2. Rewire `complexity-tiers` → Software-Engineer; retire the blanket plan-gate in `steering/engineering/core.md` Rule 1.
3. Collapse `epic-planning`/`chunk-planning` → EM's outline skill; retire `ai-engineering-plan`; update `plan-lifecycle` status vocabulary.
4. Simplify `chunk-orchestration` (drop track branching).
5. Fix domain-ownership tables (`decision-triage`, `decision-record`) and `tools.yaml`'s trifecta note.
6. Documentation sweep (`AGENTS.md`, READMEs, `install.ps1`, root docs) + regenerate `bundles/engineering/snapshot.json`.
7. `npm test` — validation suite should catch structural breakage from the roster shrink; fixture/doc-comment cleanup as a final pass.
