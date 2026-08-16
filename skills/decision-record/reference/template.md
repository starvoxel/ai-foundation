# Decision Record: {Short Title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | {ProjectID}-{###} |
| Project | {Project name} |
| Status | Draft / Approved / Done / Deferred / Superseded |
| Author (Agent) | Architect |
| Approved By | {human name or "Pending"} |
| Created | {YYYY-MM-DD HH:mm} |
| Referenced By | {Epic ID(s) that use this decision} |

---

## Problem Statement

{One to three sentences. What question did this session answer?}

## Constraints & Requirements

What was non-negotiable:
- {Constraint 1}
- {Constraint 2}

What was a preference but not a hard requirement:
- {Preference 1}

---

## Options Explored

### Option A: {Name}

**Summary**: {What it is}
**Strengths**: {In this context}
**Weaknesses**: {In this context}
**Verdict**: Chosen / Not chosen — {one sentence why}

### Option B: {Name}

**Summary**: {What it is}
**Strengths**: {In this context}
**Weaknesses**: {In this context}
**Verdict**: Chosen / Not chosen — {one sentence why}

---

## Decision

**Chosen approach**: {Option name}

**Rationale**:
{Two to four sentences explaining why this option was chosen over the others, grounded in the constraints listed above.}

**Trade-offs accepted**:
- {What you are giving up}
- {Known risks and how they will be mitigated}

---

## Design

{Optional — include when there is a concrete schema, data shape, or architecture worth documenting (e.g. a manifest format, a translation table, a component list).
Omit this section entirely for simpler decisions with nothing concrete to spell out.}

### {Subsection Name}

{Schema, table, or structural detail.}

---

## Impact on Planning

What Tech-Lead must know when writing the Epic that references this decision:
- {Constraint or pattern that must be reflected in the Epic}
- {Components that will or won't exist as a result}
- {Options explicitly ruled out — must not reappear}

---

## Resolved Items / Open Items

{Use `## Resolved Items` if every question raised during the decision was answered by the time this record was written. Use `## Open Items` if questions remain unresolved. Include either — or, if genuinely warranted, both — but never neither.}

### Resolved Items

| # | Item | Resolution |
|---|---|---|
| 1 | {Question raised during the decision} | {How it was answered} |

### Open Items

| # | Item | Owner |
|---|---|---|
| 1 | {Unresolved question} | {Human/Agent} |
