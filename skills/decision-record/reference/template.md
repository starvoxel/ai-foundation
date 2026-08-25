# Decision Record: {Short Title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | {ProjectID}-{DomainCode}-{###} |
| Project | {Project name} |
| Tier | A |
| Domain | {architecture / process / planning / ai-component / quality / testing / meta-process} |
| Status | Draft / Approved / Done / Deferred / Superseded |
| Author (Agent) | {Domain owner agent — see reference/domain-guidance.md} |
| Approved By | {human name or "Pending"} |
| Created | {YYYY-MM-DD HH:mm} |
| Last Amended | {YYYY-MM-DD} (Amendment {N}) — omit this row entirely until the record's first amendment is confirmed |
| Referenced By | {Decision ID(s) and/or Epic ID(s) that cite this record, or "—"} |
| References | {Decision ID(s) and/or Epic ID(s) this record cites, or "—"} |
| Supersedes | {Decision ID(s) this record supersedes, or "—"} |
| Tags | {comma-separated free-text tags for discovery, or "—"} |

`Referenced By`/`References` may cite either a Decision ID (`{ProjectID}-{DomainCode}-{###}`, e.g. `AIF-ARCH-004`) — another decision that relates to this one — or an Epic ID (`{ProjectID}-{###}`, e.g. `AIF-002`) — the Epic that implements, depends on, or is otherwise governed by this decision, for implementation-tracking purposes. A comma-separated list may mix both kinds; the two ID shapes are distinguishable by the presence (Decision) or absence (Epic) of the Domain Code segment. `Supersedes` cites only Decision ID(s) — a record can supersede another decision, never an Epic — and stays `—` until this record explicitly replaces a predecessor; the inverse `Superseded By` relationship is never authored by hand, it is computed by `lib/decisions.js` from every other record's `Supersedes` field.

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

---

## Amendments

{Optional — omit this section entirely until this record is amended for the first time. Append-only: once a row's `Outcome` is filled in, existing rows are never edited or deleted — including rejected proposals. Mark the amended point in the body inline with `*(amended — see Amendment N)*`. See `skill/plan-lifecycle` for the amendment rung and its two-commit gate.}

| # | Date | Section | Change | Rationale | Outcome |
|---|---|---|---|---|---|
| 1 | {YYYY-MM-DD} | {Section name} | {What changed} | {Why} | Pending / Approved by {name} / Rejected by {name} |

## Errata

{Optional — omit this section entirely until this record has its first erratum. Ungated: anyone may append a row for a change that provably leaves the rendered meaning of the record's substantive sections unchanged. No inline marker, no `Status` change, no `Last Amended` change. See `skill/plan-lifecycle` for the errata test.}

| # | Date | Change | Author |
|---|---|---|---|
| 1 | {YYYY-MM-DD} | {What changed} | {name} |
