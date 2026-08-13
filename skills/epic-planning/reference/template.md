# Epic Plan: {Short Title}

## 1. Metadata

| Field | Value |
|---|---|
| Epic ID | {ProjectShortName}-{###} |
| Project | {Project name} |
| Status | Draft / Approved / Done / Deferred |
| Author (Agent) | Tech-Lead |
| Reviewed By | {human name or "Pending"} |
| Created | {YYYY-MM-DD HH:mm} |
| Last Updated | {YYYY-MM-DD HH:mm} |
| Standards | {e.g. csharp-avalonia, project-standards link} |
| Total Chunks | {n — filled after decomposition} |
| Product Requirement | {PRD ID or "None"} |
| Decision Records | {Decision Record ID(s) or "None"} |

---

## 2. Goal

{What is being built and why? Two to four sentences. What does the user get?}

> Requirement traceability: {PRD reference or "N/A"}

---

## 3. Scope

### In Scope
- {High-level feature or capability included}

### Out of Scope
- {Explicitly deferred — at least one required}

---

## 4. Feature Description

### User-Facing Behaviour
{What the user sees and does. Walk through the experience.}

### Data Flow
{How data moves: entry point → processing → output/storage.}

### Business Rules
- {Rule 1}
- {Rule 2}

### Error States
| Scenario | Expected Behaviour |
|---|---|
| {e.g. File not found} | {Show message, log warning} |

---

## 5. Architecture Overview

### New Components
| Component | Type | Responsibility |
|---|---|---|
| {Name} | {Model/Service/ViewModel/View} | {One sentence} |

### Component Relationships
{How components interact — diagram or bullet list.}

### Integration Points
- {Existing component} — used for {reason}

---

## 6. Security Considerations
- {Concern and which chunks will address it}

---

## 7. Open Questions

| # | Question | Priority | Source | Raised By | Resolved |
|---|---|---|---|---|---|
| 1 | {Question} | H/M/L | {PRD/Design/Arch} | {Agent/Human} | No |

---

## 8. Chunk Decomposition

Dependency graph: [`chunks.json`](./chunks.json)

Summary: {N} chunks across {M} waves. {Brief description of parallelization.}

The `chunks.json` file is the machine-parseable source of truth for the dependency
graph. It must pass `dag-validate` before the epic is considered decomposed.

Start from the template at `skills/epic-planning/assets/chunks.json`.
See `skills/epic-planning/reference/chunks-schema.md` for the file format.

Parallelization notes:
- {Constraints on parallel execution}

---

## 9. Acceptance Criteria

- [ ] All chunks complete and signed off
- [ ] Feature works end-to-end as described in Section 4
- [ ] No HIGH or CRITICAL findings open in any chunk review
- [ ] Epic-level CHANGELOG entry written
- [ ] {Epic-specific criteria}

---

## 10. Work Log

{Auto-populated by agents. Format:}
[{YYYY-MM-DD HH:mm}] [{Agent}] [{Action}] [{ID}] [{Details}]
