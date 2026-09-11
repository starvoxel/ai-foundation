# Process Model — Efficiency Rework

> Status: Draft
> Created: 2026-09-03
> Approved by: Pending

Target-state description of a lighter process, plus the transition plan to reach it.
Replaces the Epic→Chunk model, the 8-agent role-pipeline (architect / tech-lead /
engineering-manager / software-engineer / ai-engineer / test-engineer /
principal-engineer / engineering-tech-writer), and the tiered Decision-Record system —
swapped for standard MADR records, written by hand for now. Everything that was never
a decision (mechanism, requirements, ownership) moves to a document type that's
allowed to stay current.

Merges two original drafts (this one and `docs/plans/agent-consolidation-plan.md`) —
they touched the same files for the same reason: proportionate ceremony.
`agent-consolidation-plan.md` is kept as a superseded historical record.

---

## Goal

Proportionate ceremony. Current-state docs instead of accreting records. Coarser work
units. One agent owns a task end-to-end — design, implementation, testing, and
documentation — instead of a role-pipeline that loses context at every handoff. A
tracker that surfaces state. Git holds history; agent context holds only what's
binding and current.

---

## Target model

### Work hierarchy

| Level | Was | Definition | Artifact | Gate |
|---|---|---|---|---|
| **Feature** | Epic | A small, definable piece of work, reviewable by a human in one pass. | Feature Plan. | One committed human approval. |
| **Task** | Chunk | One execution unit of a Feature, owned end-to-end by one Software-Engineer dispatch (design → implement → test → document). Same DAG / wave / worktree machinery. | Row in `tasks.json` (+ optional short plan, see Agent roster). | Covered by the Feature's approval, or a Tier 3 escalation per `complexity-tiers`. |

Rename plus the pipeline-ownership change in Agent roster below; mechanics carry over unchanged.

### Task sizing

- A unit of review — reviewable by Principal-Engineer in one sitting, not the smallest
  mergeable diff and not a duration estimate. Owning a Task end-to-end can take longer
  in elapsed time than the old model implied, since work that used to span SE/TE/ETW
  now runs inside one Task. Size by interface/contract boundary.
- Split a Feature into multiple Tasks only for real parallelism or a hard dependency
  boundary — not "different files," not artifact type (one dispatch handles code and
  declarative-component work alike).
- Small Features may be a single Task, or skip `tasks.json` entirely.

### Document types

Everything below is **knowledge** — non-code material an agent reads to work, the same
concept `.aiconfig.json`'s `paths.knowledge` already names (this repo points it at
`docs/`). Four kinds, split by what question each answers and whether it may change
after landing. Collapsing them into one type produced the current 16-record decision
log (per the historical index; `PLAN-001` is one of the 16 but already deleted from
disk, so 15 `.md` files remain to actually convert), 8 of which aren't decisions at all.

| Type | Answers | Mutability | Home | Owner |
|---|---|---|---|---|
| **ADR** | Why this path won over another | Immutable once accepted — superseded, never edited | `docs/decisions/` | Architect |
| **Architecture doc** | How the system currently works | Living | `docs/architecture/*`, as arc42 sections | Architect may start a section alongside an ADR; Software-Engineer maintains it at implementation time |
| **Product doc** *(reserved — not built yet)* | What a product area does, for whom | Living | `docs/product/*` | A future product agent |
| **Process & ownership** | How we work / who's accountable | Living | `steering/`, `standards/`, agent charters, Agent roster | Engineering Manager |

**Structured as arc42 + C4** (below). `architecture` reads close to "architecture
decision record," but it's the standard arc42/C4 term and agents already know it —
cheaper than a private dialect.

**Product docs are a reserved slot, not current work** — nothing needs a PRD today,
and an empty owned-by-nobody directory is how unused ceremony starts. Build it when a
product agent lands.

- One file per arc42 section/building block — replaces the old page-limit, and is what
  arc42's own numbering already implies.
- Updating the affected doc is a Feature acceptance criterion, checked in review with tests.
- Bodies stay in git; `aif index` covers architecture sections and decisions alike.
- **PRDs are an input, not a fifth type.** The Feature Plan's goal/acceptance-criteria
  section *is* the PRD today. PRDs move to the reserved slot once a product agent exists.
- **Ownership (RACI) questions aren't decisions.** Answered by the Agent roster and the
  charters it drives, never a record in `docs/decisions/`. `PROC-001/004/006` exist only
  because there was no other home for that question.

#### Subject matter is not a document kind

`skill/knowledge-authoring`'s `type` list (`decision`, `reference`, `architecture`,
`api`, `business-rule`) mixes kind and subject. The four kinds above are a pure kind
axis, split by mutability — `api`/`business-rule` become **tags** instead, and their
content lands wherever it actually fits:

| The thing | Home |
|---|---|
| Authoritative spec (OpenAPI, JSON Schema, zod, `.d.ts`) | Code — a `key_files` entry, never restated in prose |
| External interfaces | arc42 §3 Technical Context |
| A building block's interface to its neighbours | That block's §5 file |
| Stability / versioning policy | `standards/` |
| Business rule — product requirement | Reserved `docs/product/` slot |
| Business rule — how the domain is modelled | arc42 §8 or the owning §5 block |
| Business rule — externally imposed (regulatory) | arc42 §2 Constraints |

**`skill/knowledge-authoring` retires** (check 11). Once `decision`/`architecture` move
out and `api`/`business-rule` become tags, only reference material about *other*
systems is left — no arc42 home, not a procedure either. Routing goes to `steering/`;
the file shape is a template. No agent or bundle declares this skill today, and it's
the only `*-authoring` skill with no `reference/` schema, so it's already dead wiring.

### Decisions — four homes, no tiers, no domains

| Kind | Home |
|---|---|
| Binding implementer rule (stack, pattern, layering) | `standards/` or `steering/` |
| Genuine architectural/product fork — contested, costly to reverse (rare) | ADR — `docs/decisions/`, MADR format (below) |
| How the system / product works | The relevant `docs/architecture` section (or `docs/product`, once built) |
| Process / tooling / convention / ownership change | No record — edit the skill/steering/agent file; commit + CHANGELOG is the record |

- ADR scoped to one Feature is archived with it; cross-cutting ADRs are cross-linked
  from arc42 §9 so they outlive any one Feature.
- `complexity-tiers`/`plan-lifecycle` stay (trimmed). `decision-record` is **replaced
  outright** by MADR; `decision-triage`'s tier/domain classification goes with it — one
  record type left, no domain table to route through. An agent spotting a genuine fork
  dispatches Architect directly.

### ADR format — MADR

Standard MADR, replacing the in-house options-exploration template. Records *that* a
decision was made and *why*, not the research trail.

Frontmatter: `status` (`proposed`/`accepted`/`rejected`/`deprecated`/`superseded`),
`date`, `decision-makers`, `tags`, plus optional `consulted`/`informed` (both per
MADR). Two structured fields beyond vanilla MADR: `links.supersedes` (array of IDs —
the reverse edge, `superseded_by`, is computed by the indexer, never stored) and
`affects` (file globs/paths the decision binds, for "what ADRs touch this file"
lookup). `links.related`/`links.amends` are reserved, not yet populated — see
`docs/plans/adr-kit-plan.md`'s Phase 3 — the `links:` key exists now so adding them
later isn't a frontmatter migration. Sections: Context and Problem Statement →
Decision Drivers → Considered Options → Decision Outcome (+ Consequences) → optional
Pros and Cons → optional More Information.

**Budget: 150–350 words excluding frontmatter**, enforced at Principal-Engineer review
(no tooling — see ADR tooling below):

| Section | Cap |
|---|---|
| Context and Problem Statement | 2–4 sentences |
| Decision Drivers | 3–6 bullets, fragments |
| Considered Options | one line each, 2–4 options |
| Decision Outcome | 2–4 sentences tied to the drivers |
| Consequences | 3–5 one-line bullets |
| Pros and Cons of the Options | optional; 2–3 bullets, only where a rejection isn't obvious |

**Not** in an ADR — goes to the relevant arc42 section or the Feature/ticket: schemas,
config tables, algorithms, code beyond a 3-line illustration, migration/rollout steps,
implementer detail, open questions about how the system will work.

**Litmus test:** *how the system works* vs. *why this path won* — only the second
belongs. Every current ARCH record with a `Design` section fails this test, with two
acknowledged exceptions kept whole rather than split — see disposition below for why
`ARCH-005` and `ARCH-006` don't get the same treatment as `ARCH-001/002/003/007`.

An accepted ADR is never edited; a reversal is a new ADR with `links.supersedes` set.
This retires the `Amending` status and the Errata/Amendments ladder wholesale.

### ADR tooling — not needed for the proof of concept

Architect writes MADR files by hand with plain `write`. No CLI, no MCP server, no
binary — conventions enforced by the template and Principal-Engineer review, not a
linter.

This manual-authoring phase **is** Phase 0.5 of `docs/plans/adr-kit-plan.md`'s phased
build-out, and is itself the proof of concept: it validates the format by using it,
before any tooling is built around it.

`docs/plans/adr-kit-plan.md` already scopes what tooling would look like if built — an
in-repo JS CLI + MCP server, in phases — over a pinned Rust `adrs-core` binary, since `adrs-core`
has no npm-friendly distribution path and `ARCH-001` chose Node precisely for
portable, minimal-dependency tooling. That's settled. What's still open, revisited
with Architect once Phase 0.5 has enough volume to judge by: whether adr-kit is
actually needed at all, and how much of its scoped phases (1–3) are worth building — a
scope-and-need question, not an implementation-approach one.

Cost of staying manual: no scaffolding/reverse-edge automation on `links.supersedes`
(cheap — a template and the index cover both) and no structural lint (real, covered by
PE review meanwhile).

### ADR discovery — keep the existing indexer, retargeted

No CLI means no `adrs-core` MCP server to query, so discovery stays with `aif`.
`lib/decisions.js` already parses records, builds an index, and inverts `Supersedes`
into `superseded_by` — retarget its parser from the `## Metadata` table to MADR
frontmatter (reading `links.supersedes` instead of the old table row) and it serves
the new format unchanged in shape. `affects`-based reverse file-lookup is out of scope
for this retargeted indexer; that arrives with adr-kit tooling, not before. Less work
than rebuilding, and the reverse edge stays computed rather than authored twice.

`docs/decisions/index.json` is stale on `main` today (`aif index -d --check` →
`✗ Decision index is stale: Removed: AIF-PLAN-001`) — a CI gap, not a reason to retire the indexer (check 31).

Flat directory, single counter: `docs/decisions/` — no subfolders at all, not even by
type. IDs drop the current domain-coded scheme (`AIF-ARCH-001`, `AIF-PROC-003`,
`AIF-META-001`, …) and use MADR's own convention instead: the filename's bare
zero-padded number (`0007-use-postgresql.md`), one flat counter across the directory —
matching adr-kit's ID scheme exactly, so adopting it later needs no ID migration.
Frontmatter `tags` carry all categorization (`architecture`, `process`,
`meta-process`, …) the old domain subfolders and ID prefixes used to encode structurally.

### Architecture docs — arc42 + C4

One system, one repo, one arc42 — `docs/architecture/` is a flat directory of numbered
section files, no subfolders (arc42 already numbers its own sub-levels):

```
docs/architecture/
├── 01_introduction_and_goals.md
├── 02_constraints.md              ← OS-agnostic, Node-only, no network
├── 03_context.md                  ← C4 L1, inline Mermaid
├── 04_solution_strategy.md
├── 05_building_blocks.md          ← C4 L2/L3 + index of the blocks below
├── 05_01_bundle_resolution.md     ← white-box expansions, flat siblings
├── 05_02_harness_adapters.md
├── 06_runtime.md
├── 07_deployment.md               ← install/uninstall into harness directories
├── 09_decisions.md                ← pointer to docs/decisions/, never content
└── 10_quality_requirements.md
```

Why arc42+C4 over free-form subsystem docs: closes the system-level gap (§1/§2/§3/§10
have nowhere else to live); §5 is recursive, so per-subsystem detail is arc42's
white-box expansion rather than a competing structure; section numbers are addressable
("read §3 and §6") in a way filenames aren't; C4 supplies the diagrams arc42 doesn't
specify, as inline Mermaid so they stay diffable.

Two rules against ceremony: **create sections lazily** (only real content, no empty
12-section scaffold), and **§9 holds pointers, never decision content** (keeps ADRs
immutable and separate). §11 Risks and §12 Glossary likely stay absent until needed.

### Writing docs agents can consume

Applies to arc42 sections and future product docs — ADRs use MADR's own shape.

Frontmatter carries structured values only; prose lives in the body:

```yaml
---
section: "05.01"
title: "Bundle resolution"
lifecycle: published             # draft | published — staleness is not a value here, see below
last_verified: 8f3c2a1           # commit SHA, not a date — see staleness below
tags: [install, bundles]
key_files:
  - lib/resolver.js
  - lib/commands/install.js
---
```

`section` makes the arc42 role machine-readable. **Named `lifecycle`, not `status`**
— MADR's ADR frontmatter already has a `status` field with different values for a
different purpose, so reusing the name here was ambiguous. `lifecycle: draft |
published` is the *only* value an author writes (is the doc still being written?) —
completion, not currency. "Current"/"stale" never belong in it: `aif index` reports a
separate, purely computed `stale: true/false`; no frontmatter field ever claims
currency, because that claim goes stale the moment it's written.

`key_files` is structured data in frontmatter, not prose — file-level binding (a code
graph is deliberately not adopted; too early, and it gives structure without intent).
**Scope:** list a file only if a change to *that file's logic* would make this doc's
claims wrong — the actual thing the staleness check tests. Excludes callers/consumers
of the described behavior, test files (they validate behavior, not define it —
including them false-positives on every refactor), and incidentally-touched
config/types. Past roughly 5–8 entries, that's a signal to split into a finer
subsection (`05.01`, `05.02`, …) rather than let the list keep growing — a short,
tight list is what keeps a rename or deletion a meaningful CI failure, not routine
noise.

The one-line summary stays a body convention (a blockquote after the H1), so it
doesn't drift from frontmatter.

These are the only two reasons `aif index` needs to know about arc42 sections at all —
neither is a forward-browsing nav index, because arc42 doesn't need one: numbered
files in a flat directory plus §5's own building-block list already tell a human or
agent where to look. Duplicating that as a generated table of contents would be the
kind of ceremony this document is trying to remove, not add.

1. **Reverse index** — `key_files` inverted: `aif index` builds `source path → [docs]`,
   the direction arc42's own structure can't give you (same inversion pattern as
   `supersedes`).
2. **Real staleness detection** — `last_verified` as a commit SHA means *has any
   `key_files` entry changed since?* is mechanical, turning doc drift into a CI
   failure — and it's the sole source of the computed `stale` flag; no frontmatter
   field ever holds it.

`aif index` entry shape: `path`, `section`, `title`, `summary`, `lifecycle`, `tags`,
`key_files`, `last_verified`, plus the computed reverse index and `stale` flag. The
per-entry fields exist to identify what a reverse-lookup or staleness hit actually is
(a title/summary to show, a section to jump to) — not to double as a browsable index.
Same pure-parse → build → diff pipeline as today's decision indexer — generalize
`entriesEqual`'s hardcoded array-field list to "sort any array-valued field" so one
module serves both doc sets.

### Context rules

- Agents always load the relevant reference-doc file(s) and index entries for their work area.
- No full ADR bodies, superseded reasoning, or historical narration auto-loaded — the
  MADR budget makes this cheap (a whole ADR ≈ one old record's `Options Explored` heading).
- Decision records leave `knowledge/index.json`. One discovery surface: `aif index`,
  covering architecture sections and decisions through the same retargeted indexer.
- No migration tables, "supersedes X because…", or point-in-time proposals in any
  artifact body — those belong in commit messages.

---

## Agent roster

Split by context boundary and privilege level, not job title. One agent owns a Task
end-to-end because design/implement/test/document share the same rationale and lose
fidelity across handoffs. Research (context volume + privilege) and review (blackbox
verification) are the only splits that earn a separate agent.

8 agents → 5: `Tech-Lead`, `Test-Engineer`, `Engineering-Tech-Writer`, `AI-Engineer`
retire; charters absorbed below. Also closes a security gap: `architect`/`ai-engineer`
previously held write + shell + web simultaneously (the "lethal trifecta"), mitigated
only by a human-confirmation gate, not a structural boundary.

| Agent | Role | Write | Shell | Web | Subagent dispatch |
|---|---|---|---|---|---|
| **Architect** | ADRs — rare, contested, costly-to-reverse forks — plus starting the arc42 section an ADR's mechanism content splits into | Yes, scoped to `docs/decisions/**` + `docs/architecture/**` | **No** | **No** | Callable by Engineering Manager or Software Engineer; dispatches Researcher (gated) |
| **Engineering Manager** | Absorbs Tech-Lead: PRD/request → Feature Plan → Task decomposition → dispatch → orchestration | Yes (plans, orchestration state) | Yes (`ai-git`, dag tools) | **No** | Dispatches Software Engineer, Architect (spotted ADR-worthy fork), Researcher |
| **Software Engineer** | Absorbs Test-Engineer + Engineering-Tech-Writer + AI-Engineer + Task-level design. Owns product code and AI-component work alike. | Yes | Yes | **No** | Gated `subagent` → Researcher (excluded from `approved_tools`, human confirms each dispatch) |
| **Engineering Researcher** *(new)* | Web research → decision-ready brief, for Architect, EM, or SE. Scoped for ADR-grade depth, not just light briefs. | Yes, scoped to `{paths.research}` (default `knowledge/research/`, new `.aiconfig.json` field — check 3), `.md` only | **No** | Yes | No |
| **Principal Engineer** | Review gate — standards + the Feature's outline. Checklist branches by artifact type. | No (findings only) | No | No | No |

**"Scoped to X" is a reviewed convention, not a schema-enforced boundary.** The agent
schema (`skills/agent-authoring/reference/schema.md`) has no path/glob-scoping field —
`tools:`/`approved_tools:` is a flat list of tool *names*, nothing narrower. Dropping
`shell`/`web_search`/`web_fetch` from Architect's `tools:` list entirely *is* a real,
schema-enforced structural change (the agent literally cannot invoke them). "Write,
scoped to `docs/decisions/**`" is not the same kind of guarantee — nothing stops
Architect's `write` calls from touching a different path; the scope is a documented
constraint Principal-Engineer review must specifically check for (check 18), the same
enforcement class as every other hard rule in an agent's prompt. This is honestly
weaker than "structural boundary" implies for the write leg specifically, even though
it's accurate for the tool-category removals. No check in this document proposes
building path-scoped tool enforcement — that would be new framework capability, out of
scope here; flagging the gap is.

Real enforcement is plausible later without changing this plan: Kiro's
`permissions.yaml` already supports a glob-matched `fs_write` capability, and Claude
Code's `PreToolUse` hooks can inspect `tool_input.file_path` on `Edit`/`Write` calls —
both harnesses this repo already targets (`lib/harnesses/kiro.js`,
`lib/harnesses/claude.js`), each already emitting an analogous rule for
`blocked_commands`. Adding it would mean a path-scoping field on the agent schema plus
a harness-specific translation in each adapter — a future framework change, not
something check 18 or this document should take on now.

**Why AI-Engineer merges into Software-Engineer:** same privilege profile (write +
shell, no web), no context-volume or verification-role reason to split, and
parallelism already comes from dispatching multiple instances of one agent, not two
identities. Also removes real coordination cost — a Task touching both `lib/` and a
`bundle.yaml` needed two agents before. The code/declarative-artifact directory split
this repo already has is unaffected — same directories, same test categories, one
agent applying the right one per Task.

**Why Architect holds neither shell nor web:** writing MADR by hand needs only
`write`; adopting a CLI would force `shell`, recreating the trifecta this roster
removes. Architect routes research through Engineering Researcher instead of holding
web itself — keeps one web-holder, and research shaping a binding ADR passes through
an agent that can't write to the repo at all. **Consequence:** Engineering Researcher
must be scoped for ADR-grade depth (option space, trade-off evidence, enough to defend
a rejection), not just light briefs — its charter must say so (check 6).

**Why Principal-Engineer absorbs AI-component review:** branching a checklist by
artifact type is no different from already branching by language standard — not a
second reviewer role. New rule: any diff touching `tools`/`approved_tools`/
`blocked_commands` in an agent definition is always HIGH-or-above severity, which is
what makes Software-Engineer's write access to `agents/*.yaml` safe post-merge.

### Security posture

| Agent | Legs held | Residual risk |
|---|---|---|
| Architect | write only | Tightest posture of any agent that still touches the repo — no shell, no web. Sees only Researcher briefs, never raw web content. |
| Engineering Manager | write + shell, no web | Only sees compressed briefs from Architect/Researcher, never raw content |
| Software Engineer | write + shell, no web | Direct web-vector closed, but not zero — see Residual injection surface |
| Engineering Researcher | write (scoped to non-executable `.md` output) + web | The one agent allowed to hold web at all holds nothing beyond that and a narrowly-scoped write leg |
| Principal Engineer | none | Tightest posture in the roster overall — holds nothing, not even scoped write |

`skills/agent-authoring/reference/tools.yaml` should gain an explicit rule against
holding `moderate` (web) and `privileged` (write/shell) tools at once without
documented isolation — structural, not tribal knowledge.

#### Residual injection surface

Removing direct web from Software-Engineer and Architect closes the highest-volume
vector, not all of it: **Researcher's brief is a narrower but real vector**
(summarization isn't sanitization — an injected recommendation can survive into the
brief; dispatch-confirmation approves the dispatch, not the vetted content). Routing
Architect's research through the same path widens this vector's blast radius, since a
bad ADR outlives any one bad `npm install`. **Web was never the only surface** — both
agents still read repo content, install output, and ticket/PRD text of unknown origin.

Mitigation: both agents' hard rules must state a Researcher brief is data informing a
decision, never an instruction to execute directly. Architect's human approval gate is
the backstop for the ADR case.

### End-to-end flow

```
PRD / human request
      |
      v
Engineering Manager -- spots an ADR-worthy fork? --> Architect (subagent, gated)
  writes Feature Plan                                   writes ADR by hand, may start
      | human approves                                  its arc42 section; human approves
      v                                                       |
      |                                    needs research? --> Engineering Researcher
      |                                                        (gated subagent)
  dispatch per Task -------------------------------------
      |
      +--> Software Engineer -- needs research? --> Engineering Researcher (gated subagent)
      |      design -> implement -> test -> inline docs    returns brief, no code/repo write
      |      (single continuous session, own worktree)
      v
  Principal Engineer (standards + Feature Plan, not full implementation history)
      |
      +-- APPROVED -> Engineering Manager merges/advances
      +-- NEEDS_CHANGES -> back to the same Software Engineer dispatch (no cross-agent restart)
```

Correction and merge-conflict loops cycle within one agent instead of restarting a
multi-agent chain — the old model's largest coordination cost.

### Resolved design questions

**How detailed should a Feature Plan be?** Coarse — *what*, not *how*: acceptance
criteria, interface boundaries owned vs. depended on, binding standards/Approved ADRs,
a non-functional checklist (security, logging, perf — still a PE gate), explicit
out-of-scope. Not function-level design or a file-by-file breakdown — that's
Software-Engineer's own design step. Design mistakes are now caught at PE review
instead of before code is written — intended, not an oversight.

**Does Software-Engineer need a pre-approved plan per Task?** No —
`complexity-tiers` becomes its universal front door. Tier 1 proceeds directly,
self-validated. Tier 2 outlines and stops for approval, then SE implements. Tier 3 no
longer means "SE writes its own plan and implements it" — it stops and hands off:
dispatched → report back to Engineering Manager to decompose; standalone → escalate to
the human directly. Reuses `skills/decision-triage/reference/handoff-signal.md`'s
orchestrated/standalone branching *shape* even though that skill retires — the pattern
is proven and worth keeping. This is the existing "refuse if too large" behavior made
universal, not an AI-only case.

**Does "plan this" force Tier 3?** No — it's a floor on Tier 2 (stop for human sign-off
before SE implements), not a jump to Tier 3 (work genuinely too large for SE to own).
More rigor within Tier 2 is a richer outline, not a fourth tier.

**Can Software-Engineer run without Engineering Manager?** Yes — a human can drive it
directly on Tier 1/2 work with no Feature Plan first. Principal-Engineer review before
merge is a standing gate regardless of who invoked SE — "no EM" never means "no review."

**Does Engineering Manager pick up anything else?** Gated `subagent` dispatch to
Researcher (same mechanism as its Architect dispatch), and — since `decision-triage`'s
domain-routing retires — the "is this ADR-worthy" judgment moves into EM's and SE's own
prompts rather than a separate classification skill.

**Who commits an Architect-authored ADR to git, given Architect holds no `shell`?**
Architect never commits its own output. `write` scoped to `docs/decisions/**` +
`docs/architecture/**` produces the file; the dispatching agent (EM or SE) commits it
through the `shell`/`ai-git` access it already holds for its own plans — a process
step, not a new tool grant. Must be stated explicitly in the dispatching agent's prompt
(check 6).

**What survives when `decision-triage` retires?** Only the structural pattern (branch
on orchestrator presence, stop-and-report vs. hand-to-orchestrator) — not
`handoff-signal.md`'s Tier/Domain content, which is deleted with the rest of the skill
(check 11). Software-Engineer's Tier 3 hand-off re-implements the shape natively.

---

## Existing artifacts

| Artifact | Disposition |
|---|---|
| `AIF-001`, `AIF-002` epics + chunk plans | Substantively complete (orchestration state records both `"status": "Complete"`, all chunks `"Done"`) — but their own `Status` field reads `Approved` / `Approved (rev 6)`, not `Done`. Leave in place as history either way — no migration, no rename; flipping the field to match reality is optional cleanup, not required by this document. |
| `AIF-003` epic (decision-record amendment ladder) + its 8 chunk plans | **Abandoned mid-flight.** The ladder it implements is retired by this model. PRs #23/#24 closed unmerged 2026-09-09; chunks `001/003/004` had already merged and need unwinding (checks 1 and 30). Chunk `005` also merged but needs **no** unwinding — check 30 keeps its change (the steering de-enumeration is correct under MADR too). |
| `AIF-004` (Draft — planning redesign) | Superseded. Valid pieces (one gate per Feature, tier-aware pipeline, terminology sweep) roll in above. Mark `Deferred` and archive (`Superseded` isn't a legal Epic Plan status) — check 2. |
| `docs/plans/agent-consolidation-plan.md` | Already `Status: Superseded` on disk (flipped in the same commit that merged its content here) — nothing left to do; listed for completeness, not as a pending action. Leave in place as history. |
| `docs/plans/chunk-epic-planning-redesign-plan.md`, `docs/plans/tech-lead-subagent-dispatch-plan.md` | **Already deleted, not archived**, ahead of sequencing — both doubly-orphaned/moot with nothing not already captured here. `AIF-002`'s frozen chunk plans still reference the deleted path as historical record (`AIF-001` has no chunk plans that do — its only file predates both deleted plans). |
| Freeform `docs/plans/*.md` (`cli-plan`, `ai-git-enforcement`, `commit-discipline-plan-gate`, `gmail-*`, …) | Triage each: Done → `docs/plans/completed/`; real upcoming work → a Feature; process change → fold into the edit and delete; stale → delete. No new freeform plans after this. |
| `ai-engineering-plan` skill / "Tier 3 plan" | Retired. Small work runs under `complexity-tiers`; larger becomes a Feature. |
| `agents/tech-lead.yaml`, `test-engineer.yaml`, `engineering-tech-writer.yaml`, `ai-engineer.yaml` | Retired — charters absorbed per Agent roster. |
| `agents/architect.yaml`, `software-engineer.yaml`, `engineering-manager.yaml`, `principal-engineer.yaml` | Modified per Agent roster (tool grants, scope). |
| `agents/engineering-researcher.yaml` | New. |
| 16 decision records (15 files on disk — `PLAN-001` already deleted, live only in the stale index) | Converted to MADR or rehomed — see disposition below. |

Archived records/plans move to an `archive/` subfolder with status noted — not deleted;
git plus a browsable trail is the audit record.

**Retiring a plan uses `Deferred`** — Epic/Chunk Plans allow only
`Draft`/`Approved`/`Done`/`Deferred` (`Superseded` is Decision-Record-only), so `AIF-003`
and `AIF-004` both move to `Deferred` + `archive/`, not a new `Abandoned` status.
Freeform `docs/plans/*.md` isn't governed by that vocabulary.

### Decision-record disposition

All seven ARCH records are genuine ADRs with real options and trade-offs — none
mislabeled. Five of the seven (`001/002/003/004/007`) get their `Design` section split
out because it fails the litmus test above; `005`/`006` are the acknowledged exceptions
kept whole, with the reasoning given in their own rows below.

| Record | Genuine ADR? | Disposition |
|---|---|---|
| `ARCH-001` Install CLI redesign | Yes | Core → MADR. `Design` (bundle schema, manifest, adapter table) → arc42 §5 install/bundle sections. |
| `ARCH-002` Steering schema & harness scoping | Yes | Core → MADR. `Design` → arc42 §5 (harness adapters); `Known Limitations` (Kiro `fileMatch` bug) → §11 Risks. |
| `ARCH-003` Shared resource lifecycle | Yes | Core → MADR. `Design` → arc42 §5 (manifest/snapshot) and §6 Runtime. |
| `ARCH-004` Standards sync mechanism | Yes, still `Draft` | Decide or drop before converting (check 24) — its byte-level schema belongs in arc42 §5, not a frozen ADR. |
| `ARCH-005` DAG tool as MCP server | Yes | Convert whole, deliberately **not** split despite its `Design` section technically failing the litmus test too — that section is short and inseparable from the decision's own reasoning (why an MCP server shape, not a bigger "how it's built" write-up), so splitting would gut the record's retrospective value for no arc42 content worth seeding. |
| `ARCH-006` `ai-git` tool boundary | Yes — a decision not to build | Convert whole. Passes the litmus test cleanly — it has no `Design` section at all, so nothing fails it and nothing needs folding anywhere. |
| `ARCH-007` Epic/Chunk → YouTrack | Yes, still `Draft` | Same "decide or drop before converting" gate as `ARCH-004` (check 24) — not called out separately before, but it's in the identical state. Once approved: Core → MADR, `Design` (field schema, workflow rules) → `docs/plans/youtrack-integration-plan.md`. |
| `PROC-001` AI-Engineer/SE boundary | No — ownership | → `steering/`; no longer an agent boundary. |
| `PROC-002`, `PROC-006` AI-track dispatch/decomposition | No — ownership | Moot — AI-track distinction retires with the merge. |
| `PROC-003` Parallel chunk isolation (worktrees) | Partly, still `Draft` | Same gate as `ARCH-004`/`ARCH-007` (check 24). Once approved: short MADR ADR for the worktrees-vs-alternatives trade-off; operational detail → orchestration skill text. |
| `PROC-004` Standards sync ownership | No — ownership | → `steering/`, alongside `PROC-001`. |
| `PROC-005` Git workflow mode | No — convention | → `steering/`. |
| `PLAN-001` Epic/chunk colocation | No — convention | Already deleted from disk; retire the stale index reference (check 28). |
| `META-001`, `META-002` Tiering + amendment ladder | No — meta-process | Retired wholesale — MADR's budget/immutability prevent this bloat structurally. |

Corrects an earlier disposition that folded `ARCH-001/005/006` into architecture docs
and archived them — that discards real decision rationale.

### New ADRs to write

Load-bearing choices the stack makes but records nowhere. Write these as MADR during
the conversion:

| ADR | Evidence it's undocumented |
|---|---|
| Plain JavaScript + JSDoc, no TypeScript | `tsconfig.json` exists (`allowJs`/`checkJs`, feeding `npm run typecheck`) but only typechecks JSDoc — no `.ts` source anywhere despite JSDoc typedefs + runtime `zod`. That split is the undocumented decision. |
| `node:test` over Jest/Vitest/Mocha | None of the three appear in `package-lock.json` — worth recording because it's the less common choice. |
| MCP server credential handling | `servers/gmail` uses OAuth, `servers/youtrack` a static token — two patterns, no unifying record, though `ARCH-006` already treats this class as ADR-worthy. |

Not missing ADRs: **ESM-only** (real but low-stakes — a line in the architecture doc)
and **CI** — `.github/workflows/ci.yml` (lint, typecheck, format, validate, test on
Node 22.x/26.x) already exists, landed via a sibling PR before this document merged;
not an open question this work resolves. Check 31 adds new guards to that workflow.

---

## Implementation checks

Numbered in the order they're meant to run — no more sub-lettered checks (the old
`8b`/`8c`/`13b`/`16b`/`21b` are now plain numbers in sequence). See Sequencing below for
how these group into phases.

| # | Check |
|---|---|
| 1 | `AIF-003` torn down: Epic Plan + all 8 chunk plans move to `Deferred` and `archive/` (creating `docs/plans/archive/` if it doesn't exist yet), reason recorded once, `chunks.json`/`orchestration-state.json` archived alongside. Delete stale remote branches: `AIF-003/002-amendment-index-fields`, `AIF-003/006-plan-lifecycle-ladder-docs`, plus older strays `AIF-001/003-epic-planning-ai-track`, `AIF-002/010-migrate-aif-006`, `AIF-002/015-backfill-decisions-index`. |
| 2 | `AIF-004` marked `Deferred` and moved into `archive/` (per Retiring a plan above). Much lighter than `AIF-003`'s teardown (checks 1 and 30): `AIF-004` was never dispatched — no `chunks.json`, no orchestration state, no branches or PRs to unwind. Just the epic file's `Status` flip and a move to `archive/`. |
| 3 | `.aiconfig.json` schema: `paths.epics`→`paths.features`, `paths.chunks`→`paths.tasks`, add `paths.architecture`, add `paths.research` (default `knowledge/research/`, for Engineering Researcher), keep `paths.decisions` (now flat), reserve `paths.product` without a default. Code change too — `resolveKnowledgePath`/`resolveDecisionsPath` in `lib/commands/index.js` read these; `AGENTS.md`'s field table documents them. This repo's own `.aiconfig.json` updated to match. Lands first so nothing downstream (agent scopes, `aif index`, the template) references a path field that doesn't exist yet. |
| 4 | `docs/architecture/` exists as a flat arc42 section directory with a section-file template (frontmatter: `section`, `title`, `lifecycle`, `last_verified` as a commit SHA, `tags`, `key_files`; one-sentence blockquote summary after the H1). Sections created lazily — only §1/§2/§3/§5 need exist at the start. `docs/product/` **not** created — reserved, no owner yet. |
| 5 | `aif index` extended for arc42 sections (entry shape above), for two things §5 and the numbered directory can't give you: the computed `source path → [docs]` reverse index from `key_files`, and the `stale` flag from `last_verified`. Not a forward nav index — arc42's own numbering + §5's block list already cover browsing, so none is built. Decisions stay in scope via the retargeted indexer (check 28) — one module, two doc sets. |
| 6 | Agent YAMLs updated per Agent roster: 4 retired, 4 modified, 1 new. `architect.yaml` **loses** `shell` and `web_search`/`web_fetch`, gains only plain `write` (scoped to `docs/decisions/**` + `docs/architecture/**`) plus gated Researcher dispatch — no `@adr/*` tools exist, per ADR tooling above. `engineering-researcher.yaml` scoped for ADR-grade depth, write scoped to `{paths.research}` from check 3. Also states explicitly, in whichever agent dispatches Architect, that it — not Architect — commits the resulting ADR/arc42 file. Everything else in this list derives from this check. |
| 7 | `epic-planning` + `chunk-planning` merge into `feature-planning`: renamed, Task-sizing rules added, small Features may skip decomposition. |
| 8 | `chunk-orchestration`: `chunks.json` → `tasks.json`; per-Task plan gate replaced by `complexity-tiers`; software/AI-track branching removed — one pipeline (implement+self-test+docs → PE review) for every Task. |
| 9 | DAG server + `lib` renamed chunk→task; wave output identical for an equivalent graph. Includes `servers/dag/logic.js`'s doc comment and the chunk/epic-worded test fixtures in all three `servers/dag/tests/**` files, not just identifiers. |
| 10 | What `knowledge-authoring` carried is re-homed: a steering rule holds the four-kind routing table; templates hold the file shapes (MADR, arc42 section, external-reference file). A skill earns its place with judgment/validation steps; a template + always-on rule is enough for light-structure prose. Resolved before check 11 so that check knows whether `docs/knowledge-file-format.md` still needs a body. |
| 11 | `decision-triage`, `decision-brief`, `decision-record`, `chunk-planning`, `ai-engineering-plan`, `knowledge-authoring` skills deleted, all references removed. `decision-record` because MADR replaces (not shrinks) it; `knowledge-authoring` per Subject matter is not a document kind (check 10). `docs/knowledge-file-format.md` — the live canonical spec for the exact `type: decision\|reference\|architecture\|api\|business-rule` taxonomy this section retires — rewritten to match (or deleted if check 10's steering rule + templates fully replace what it specified); it's actively pointed to from `projects/_template/knowledge/example.md` and several `docs/plans/*.md` files, which need the same update. |
| 12 | `plan-lifecycle`/`complexity-tiers` trimmed; `complexity-tiers` re-pointed as SE's primary gate. Tier 3 becomes "stop and hand off" (orchestrated → EM, standalone → human). `plan this` documented as a Tier 2 floor, not a Tier 3 jump. |
| 13 | `projects/_template/` brought to the new format — every consuming project starts from this skeleton. Not just the old `epics/chunks/orchestration` layout renamed: the **full** new document layout, mirroring what checks 3–12 just built. `.aiconfig.json`'s new `paths.*` fields (check 3) filled in for the template itself. `plans/{features,tasks,orchestration}/` (renamed from `epics/chunks/orchestration`, per checks 7–8). `knowledge/decisions/` (flat, MADR-ready — mirrors `docs/decisions/`) and `knowledge/architecture/` (empty; arc42 sections created lazily per check 4, never pre-scaffolded) and `knowledge/research/` (the `paths.research` target). **No** `knowledge/product/` directory — the Product doc type stays a reserved slot with no owner and no folder until a product agent lands; scaffolding an empty one is exactly the premature ceremony this model exists to avoid. `project-standards.md`'s references to the skills retired in check 11 updated. |
| 14 | `steering/engineering/core.md` Rules 1/2/8/9 reworded (Rule 1 → `complexity-tiers` gate, Rule 2 gets a Tier 1/2 fallback, Chunk/Epic Plan → Feature Plan); `knowledge-consumption.md` moves decision-records from full-body auto-load to **index-only by default, full body on demand**; doc-update acceptance gate added. |
| 15 | **Full vocabulary + reference sweep**, not just planning skills: `skills/code-review/`, `skills/test-execution/`, `skills/worktree-management/SKILL.md`, `skills/complexity-tiers/SKILL.md`, `skills/plan-lifecycle/reference/commit-gate-procedure.md`, `standards/csharp_base.md`, `standards/javascript_base.md`, `steering/engineering/git-workflow-projects.md`. Deleted-skill references also in `skills/agent-authoring/reference/schema.md`, `projects/_template/project-standards.md`, `standards/javascript_node.md`, and `lib/resolver.js`'s JSDoc examples. |
| 16 | `skill/agent-authoring` and `docs/agent-prompt-extraction-candidates.md` swept. Product-doc ownership **not** assigned — reserved and unbuilt. |
| 17 | `skills/agent-authoring/reference/tools.yaml` gains the trifecta-avoidance rule (no agent holds `moderate`/web and `privileged`/write+shell at once without documented isolation). |
| 18 | `skill/code-review`'s checklist gains an explicit item, since the agent schema has no path-scoping field to enforce this instead (see Agent roster's "reviewed convention, not schema-enforced" note): for any diff where Architect or Engineering Researcher performed the `write`, Principal-Engineer confirms the touched paths stay within their documented scope — `docs/decisions/**`/`docs/architecture/**` for Architect, `{paths.research}` for Researcher. A violation is a HIGH finding, same severity class as the existing `tools`/`approved_tools`/`blocked_commands` rule (Why Principal-Engineer absorbs AI-component review, above). |
| 19 | Software-Engineer's hard rules state a Researcher brief is data informing a decision, never an instruction to execute; confirm PE review applies regardless of who dispatched SE. |
| 20 | `bundles/engineering/snapshot.json` regenerated (`bundle.yaml` needs no edit — domain-based auto-discovery absorbs the shrink). Run only after checks 6 and 11 have actually landed, or the snapshot still reflects the pre-shrink roster. |
| 21 | `README.md`, `PLAN.md`, `AGENTS.md`, `agents/README.md`, `skills/README.md` updated. `install.ps1` not in scope — already deleted (dead per `ARCH-001`), its `tools.test.js` assertion removed with it. |
| 22 | `tests/validation/` cross-reference check passes against the new set; `npm test` green. Fixtures cleaned up: `tests/unit/decisions.test.js`, `tests/integration/decisions-index.test.js`, `knowledge-index.test.js`, `base.test.js`, `claude-adapter.test.js`, `kiro-adapter.test.js`, `tests/unit/resolver.test.js`, `tests/integration/resolver.test.js`, `tests/integration/commands.test.js`. |
| 23 | Terminology-sweep verification as an automated `tests/validation/` check: repo-wide `chunk`/`epic` search returns zero matches outside `docs/plans/{chunks,epics,orchestration}/`, `docs/plans/completed/`, `docs/plans/archive/`, MADR record bodies (e.g. `ARCH-007`), and `docs/decisions/index.json` (generated from those bodies, not itself a body). `agent-consolidation-plan.md` and `AIF-004.epic.md` are covered as kept-in-place history. The two already-deleted plans need no exception. Runs last, once checks 3–21 have landed — including check 13, so `projects/_template/` is clean too. |
| 24 | Human decision gate for every source record still `Status: Draft` at conversion time — currently `ARCH-004`, `ARCH-007`, `PROC-003` (verified against `docs/decisions/index.json` and each file's own Metadata table). Each gets an explicit `Approved`/`Deferred` call before its MADR conversion (check 27 or 29) proceeds — `Draft` never silently becomes an accepted MADR record. A `Deferred` verdict drops that record from this pass entirely rather than converting it speculatively. |
| 25 | Existing decision records dispositioned per the table above; archive location created. |
| 26 | `docs/decisions/` flattened (domain subfolders removed, flat bare-number MADR counter — `0007-slug.md`, no domain-coded `AIF-ARCH-`/`AIF-PROC-`/etc. prefix); every surviving record rewritten by hand into MADR within the word budget, renumbered onto the new counter, checked at PE review. |
| 27 | `Design` sections split out of `ARCH-001/002/003/007` into their arc42 homes (or the YouTrack plan for `007`), plus `ARCH-004` if check 24 approves it; `ARCH-005/006` converted whole per their disposition-table exceptions. This is what seeds `docs/architecture/` with real content. |
| 28 | `lib/decisions.js` **retargeted, not deleted**: parser moves from the `## Metadata` table to MADR frontmatter, keeping index generation and the `supersedes`→`superseded_by` inversion. `aif index -d` and `docs/decisions/index.json` stay. `tests/unit/decisions.test.js` and `tests/integration/decisions-index.test.js` updated to new fixtures. |
| 29 | The three New ADRs to write are written in MADR form. |
| 30 | Merged half of `AIF-003` unwound, minus what already dies elsewhere. Real revert: `AIF-003-004`'s `Amending` status, removed from `plan-lifecycle/reference/status-vocabulary.md` by hand. `AIF-003-003`'s Amendments/Errata template sections die with check 11; `AIF-003-001`'s `Supersedes` parse dies with check 28 — no separate revert needed. `AIF-003-005`'s steering de-enumeration is **kept** (correct under MADR too). |
| 31 | New guards added to the **existing** `.github/workflows/ci.yml` (already runs lint/typecheck/format/validate/test): the `key_files`-vs-`last_verified` staleness check, relative-link resolution across `docs/architecture`, `aif index --check`. No `adrs-core lint` or hyphenated-`kind` guard — both moot while ADRs are hand-written. |
| 32 | Freeform `docs/plans/*.md` triaged and cleared; `docs/plans/completed/` holds the finished ones. |
| 33 *(deferred)* | A **deferred** ADR, written by Architect once there's enough hand-written volume: ADR tooling (Rust CLI vs. in-repo JS vs. staying manual — see ADR tooling above, and `docs/plans/adr-kit-plan.md`). Gates nothing — deliberately outside the sequence below. |

---

## Sequencing

Checks are numbered in the order they're meant to run. The phases below just group
consecutive checks that land together in one pass — work top to bottom, phase by
phase, check by check.

1. **Retire abandoned work** (checks 1–2) — independent and cheap, and removes the
   largest current source of confusion about what's still live. `AIF-003`'s PRs are
   already closed; `AIF-004` was never dispatched.
2. **Config scaffolding** (checks 3–4) — `.aiconfig.json`'s new `paths.*` fields land
   first, before anything downstream (agent scopes, `aif index`, the template) can
   reference a field that doesn't exist yet. Then the arc42 directory + section
   template.
3. **Index tooling** (check 5) — `aif index` extended for arc42 sections, now that
   `docs/architecture/` and `paths.architecture` both exist.
4. **Agent roster** (check 6) — everything from here on derives from it.
5. **Vocabulary rename** (checks 7–9) — Feature/Task terminology, then the DAG/lib
   chunk→task rename.
6. **Skill retirement & re-homing** (checks 10–12) — decide where `knowledge-authoring`'s
   content goes first, then delete the skills that decision retires, then trim
   `plan-lifecycle`/`complexity-tiers`.
7. **Template alignment** (check 13) — `projects/_template/` rebuilt on the full new
   layout. Depends on the vocabulary rename (phase 5) and skill retirement (phase 6)
   it's built to reflect.
8. **Steering & reference sweep** (checks 14–16) — core steering rules first, then the
   wider vocabulary/reference sweep, then `agent-authoring`.
9. **Cross-cutting process/security rules** (checks 17–19) — the trifecta-avoidance
   rule, the code-review path-scoping check, and Software-Engineer's Researcher-brief
   rule.
10. **Regeneration & top-level docs** (checks 20–21) — the bundle snapshot regenerates
    only once the roster and skill shrink (phases 4 and 6) are actually on disk;
    top-level docs update last so they describe the settled state.
11. **Verification** (checks 22–23) — `npm test` green first, then the terminology
    sweep, once every check in phases 2–10 has landed.
12. **Decisions conversion** (checks 24–29) — resolve the Draft-record gate first,
    then disposition, flatten, rewrite, split `Design` sections into arc42, retarget
    the indexer, and write the three missing ADRs. Depends on phase 2 (arc42 needs
    somewhere to receive the split-out `Design` content).
13. **Unwind the merged half of `AIF-003`** (check 30) — small by this point; depends
    on phase 6 (skill retirement) and phase 12 (decisions retargeting).
14. **CI guards** (check 31) — added once there's a converted decision log and
    populated arc42 sections to actually run against.
15. **Freeform plan triage** (check 32) — last, once the rest of the repo has settled.

Check 33 (ADR tooling) is deliberately outside this sequence — Architect's to write
later, gates nothing.

YouTrack integration is a separate follow-on layer — see
`docs/plans/youtrack-integration-plan.md` — sequenced independently; nothing here
depends on it.
