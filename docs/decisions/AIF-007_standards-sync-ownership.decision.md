# Decision Record: Ownership of Standards Push/Pull/Sync (PLAN.md v1.3)

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-007 |
| Project | ai-foundation |
| Status | Draft |
| Author (Agent) | Architect |
| Approved By | Pending |
| Created | 2026-08-13 |
| Referenced By | AIF-008 |
| References | AIF-004, AIF-005, AIF-009 |

---

## Problem Statement

`PLAN.md` lists, under v1.3 (Tooling): "Standards distribution and sync (push/pull
between aif and projects)" — currently unscoped beyond that one line. Before
Tech-Lead can write an Epic Plan for it, ownership needs to be settled: is this
Software-Engineer's work (it sounds like a CLI feature), AI-Engineer's work (it's
about `standards/` content), or split — and if split, along what line, consistent
with the AIF-004/AIF-005 boundary already established for this repo.

This is distinct from what already exists. Today, `aif install` performs a one-way,
install-time copy of `standards/*.md` from the `ai-foundation` source repo into a
harness's install target (`lib/resolver.js` + `tests/integration/standards.test.js`
confirm this), and `.aiconfig.json`'s `project_standards` field points to a
project-local override file. Neither of those is "sync between aif and projects" —
there is no existing mechanism for a project repo to pull the latest standards
content into its own repo (as opposed to a harness's install directory), or to push
a locally-refined standard back up to `ai-foundation` for other projects to benefit
from. This is new capability, not an extension of an existing command's flags.

---

## Constraints & Requirements

What was non-negotiable:
- Ownership must follow the AIF-004 boundary: `bin/`/`lib/`/tests-of-code work is
  Software-Engineer's; declarative-component content and schema (including
  `.aiconfig.json` fields documented in `AGENTS.md`, and any new skill describing
  the sync workflow) is AI-Engineer's.
- Whatever ships must still pass through Rule 1 (`engineering-core.md`) — no
  implementation without an approved plan — regardless of which agent(s) are
  assigned.
- This decision is scoped to **ownership**, not to the sync mechanism's design
  (conflict handling, whether "push" opens a PR automatically, cross-repo git
  identity/permissions) — that design question is deferred to a dedicated follow-up
  Decision Record rather than resolved here (see AIF-008).

What was a preference but not a hard requirement:
- Reuse existing infrastructure where possible (`resolver.js`'s standards listing,
  `snapshot.js`'s hash-based freshness detection already used for install
  staleness) rather than building parallel mechanisms.

---

## Options Explored

### Option A: Entirely Software-Engineer

**Summary**: Treat this as a pure CLI feature — new `aif push`/`aif pull` (or
similar) commands in `lib/commands/`, using the existing hash/snapshot
infrastructure. Software-Engineer implements everything, including any
`.aiconfig.json` field additions and `AGENTS.md` documentation the feature needs.
**Strengths**: Single owner, single Chunk Plan, no coordination overhead.
**Weaknesses**: Directly contradicts AIF-004 — `.aiconfig.json`'s schema is
documented in `AGENTS.md`, which is declarative-component reference material, and
`complexity-tiers` explicitly lists "changing a schema" as Tier 3 AI-Engineer work.
Software-Engineer authoring schema/doc changes reintroduces exactly the
cross-domain-authorship problem AIF-004/AIF-005 exist to prevent.

### Option B: Split by artifact type, per AIF-004/AIF-005

**Summary**: Tech-Lead decomposes this as an Epic with (at least) two chunks: a
software-track chunk — the CLI mechanism itself (new command(s), diff/hash logic
reusing `snapshot.js`, any cross-repo git operations via `ai-git`, and its tests) —
assigned to Software-Engineer; and an AI-track chunk — the `.aiconfig.json` schema
additions and `AGENTS.md` documentation the feature needs, plus (if warranted) a new
skill documenting the sync workflow for agents — assigned to AI-Engineer, per
AIF-005's dual-authorship, track-appropriate-plan model.
**Strengths**: Matches the boundary and mechanism this repo has already committed
to in AIF-004/AIF-005 — this is the first real feature that exercises that design,
which is a reason to use it, not avoid it. Each piece is written by the agent
with the relevant expertise.
**Weaknesses**: AIF-005's own "Impact on Planning" section notes that
`chunk-orchestration`/`chunk-planning`/`epic-planning` still need to be updated to
actually dispatch by track — that implementation work has not landed yet. Until it
does, this Epic cannot be *automatically* dual-track dispatched; Tech-Lead would
need to sequence the two chunks as an ordinary dependency (AI-track chunk done
first or in parallel, software-track chunk follows) rather than relying on
orchestration to route them, or the AIF-005 orchestration work needs to land first.

### Option C: Entirely AI-Engineer, redefined as a manual/documented procedure

**Summary**: Avoid new CLI code. "Pull" is satisfied by the already-existing
`aif install --update`. "Push" becomes a documented manual procedure (a new skill
instructing a human or agent to copy a locally-modified standard back into
`ai-foundation`'s `standards/` directory and commit) rather than an automated
command.
**Strengths**: No new code, no cross-repo git-write capability to secure — the
highest-risk part of this feature (a tool that commits into a *different* repo than
the one it's currently running in) is avoided entirely.
**Weaknesses**: Doesn't build the feature `PLAN.md` actually scopes. `Install
--update` is already a separate, already-`Done` line item in `PLAN.md` — reusing it
for "pull" quietly redefines this feature down to something already shipped. A
manual copy-and-commit procedure has no hash/provenance tracking and no conflict
detection between a project's local edit and an upstream change since it was last
pulled, which is the actual problem "sync" implies solving.

---

## Decision

**Chosen approach**: Option B — split by artifact type, following AIF-004's
boundary and AIF-005's dual-track chunk model.

**Rationale**: This repo already has a settled answer for "which agent owns which
kind of change" (AIF-004) and a settled mechanism for expressing a mixed-track Epic
(AIF-005). This feature is declarative-schema-plus-CLI-code by nature —
exactly the shape those decisions were built for. Assigning it entirely to one agent
(Option A or C) would mean re-litigating a boundary that's already decided, in
either direction: Option A puts schema/doc authorship in the wrong agent's hands;
Option C avoids real engineering work by narrowing the feature until it no longer
needs any.

**Trade-offs accepted**:
- This Epic may need to be sequenced manually (AI-track chunk before/alongside the
  software-track chunk, without automatic track-aware dispatch) if it is planned
  before AIF-005's orchestration-skill updates land. Tech-Lead should check whether
  that follow-up work is done before decomposing this Epic, and flag it as a
  dependency if not.

---

## Impact on Planning

- This record settles **who** builds the sync feature, not **how it works**. The
  mechanism design (conflict handling, whether "push" opens a PR, cross-repo git
  identity) was deliberately out of scope here and has since been resolved in
  AIF-008 — Tech-Lead should treat AIF-008 as the binding mechanism design when
  writing the software-track Chunk Plan.
- Confirm whether AIF-005's `chunk-orchestration` track-aware dispatch update has
  landed before decomposing this Epic; if not, sequence the AI-track and
  software-track chunks manually rather than relying on automatic dispatch.

---

## Resolved Items

| # | Item | Resolution |
|---|---|---|
| 1 | Who implements the CLI mechanism for standards push/pull/sync? | Software-Engineer, via Tech-Lead's Epic/Chunk process, per AIF-004. |
| 2 | Who implements the schema/doc changes (`.aiconfig.json` fields, `AGENTS.md`, any new skill)? | AI-Engineer, per AIF-004/AIF-005. |
| 3 | Is the sync mechanism's design (conflict handling, PR-vs-direct-push, cross-repo git identity) decided by this record? | No — explicitly out of scope here. Resolved separately in AIF-008. |
