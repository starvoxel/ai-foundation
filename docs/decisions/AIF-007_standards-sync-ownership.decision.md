# Decision Record: Ownership of Standards Push/Pull/Sync (PLAN.md v1.3)

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-007 (pending renumber to AIF-PROC-004 under AIF-META-001) |
| Project | ai-foundation |
| Tier | B |
| Domain | Process |
| Status | Draft |
| Author (Agent) | Architect |
| Approved By | Pending |
| Created | 2026-08-13 |
| Revised | 2026-08-14 — downgraded Tier A to Tier B per AIF-META-001; options-exploration content removed, record condensed to the slim format |
| Referenced By | AIF-008 |
| References | AIF-004, AIF-005, AIF-009 |

---

## Problem Statement

`PLAN.md` lists, under v1.3 (Tooling): "Standards distribution and sync (push/pull
between aif and projects)" — currently unscoped beyond that one line. Before
Tech-Lead can write an Epic Plan for it, ownership needs to be settled: is this
Software-Engineer's work (it sounds like a CLI feature), AI-Engineer's work (it's
about `standards/` content), or split — and if split, along what line.

This is new capability, not an extension of an existing command's flags. Today,
`aif install` performs a one-way, install-time copy of `standards/*.md` into a
harness's install target; `.aiconfig.json`'s `project_standards` field points to a
project-local override file. Neither of those lets a project repo pull the latest
standards content into its own repo, or push a locally-refined standard back up to
`ai-foundation` for other projects to benefit from.

This record is scoped to **ownership** only — not the sync mechanism's design
(conflict handling, cross-repo git identity), which is resolved separately in
AIF-008.

---

## Decision

**Chosen approach**: Split by artifact type, following the boundary AIF-004
already established and the dual-track chunk model AIF-005 already provides.
Tech-Lead decomposes this as an Epic with a software-track chunk — the CLI
mechanism itself (new command(s), diff/hash logic reusing `snapshot.js`, any
cross-repo file operations, and their tests) — assigned to Software-Engineer; and
an AI-track chunk — the `.aiconfig.json` schema additions, `AGENTS.md`
documentation, and (if warranted) a new skill documenting the sync workflow —
assigned to AI-Engineer.

**Rationale**: This repo already has a settled answer for "which agent owns which
kind of change" (AIF-004) and a settled mechanism for expressing a mixed-track
Epic (AIF-005). This feature is declarative-schema-plus-CLI-code by nature —
exactly the shape those decisions were built for. Assigning it entirely to one
agent would mean re-litigating a boundary that's already decided: putting
schema/doc authorship in the wrong agent's hands, or narrowing the feature until
it no longer needs real engineering work just to avoid a two-agent split. This
decision does not weigh genuinely distinct technical designs against each other —
it applies an already-settled precedent to a new feature, which is why it is
recorded at Tier B rather than Tier A.

**Trade-offs accepted**:
- This Epic may need to be sequenced manually (AI-track chunk before/alongside
  the software-track chunk, without automatic track-aware dispatch) if planned
  before AIF-005's orchestration-skill updates land. Tech-Lead should check
  whether that follow-up work is done before decomposing this Epic.

---

## Impact on Planning

- This record settles **who** builds the sync feature, not **how it works**. The
  mechanism design was deliberately out of scope here and has since been resolved
  in AIF-008 — Tech-Lead should treat AIF-008 as the binding mechanism design when
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
| 3 | Is the sync mechanism's design (conflict handling, cross-repo git identity) decided by this record? | No — explicitly out of scope. Resolved separately in AIF-008. |
