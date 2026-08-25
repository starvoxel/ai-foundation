# Decision Brief: {Short Title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | {ProjectID}-{DomainCode}-{###} |
| Project | {Project name} |
| Tier | B |
| Domain | {architecture / process / planning / ai-component / quality / testing / meta-process} |
| Status | Draft / Approved / Done / Deferred / Superseded |
| Author (Agent) | {Domain-owning agent} |
| Approved By | {human name or "Pending"} |
| Created | {YYYY-MM-DD HH:mm} |
| Last Amended | {YYYY-MM-DD} (Amendment {N}) — omit this row entirely until the record's first amendment is confirmed |
| Referenced By | {Decision ID(s) that cite this decision, or "—"} |
| References | {Decision ID(s) this decision cites, or "—"} |
| Supersedes | {Decision ID(s) this decision supersedes, or "—"} |
| Tags | {comma-separated free-text tags for discovery, or "—"} |

---

## Problem

{One to three sentences. What question does this decision answer?}

---

## Decision

**Chosen approach**: {What was decided.}

---

## Rationale

{Two to four sentences: why this was decided, grounded in the constraints or
context that mattered. Tier B does not require an Options Explored section —
if you find yourself needing to weigh 2+ genuinely distinct alternatives with
lasting cross-component impact, this decision may actually be Tier A; escalate
to `skill/decision-record` instead of listing alternatives here.}

---

## Impact

{What this decision affects: components/plans that must reflect it, anything
explicitly ruled out, and any domain ambiguity noted per the Edge Cases in
`skill/decision-brief`'s SKILL.md.}

---

## Amendments

{Optional — omit this section entirely until this decision is amended for the first time. Append-only: once a row's `Outcome` is filled in, existing rows are never edited or deleted — including rejected proposals. Mark the amended point in the body inline with `*(amended — see Amendment N)*`. See `skill/plan-lifecycle` for the amendment rung and its two-commit gate.}

| # | Date | Section | Change | Rationale | Outcome |
|---|---|---|---|---|---|
| 1 | {YYYY-MM-DD} | {Section name} | {What changed} | {Why} | Pending / Approved by {name} / Rejected by {name} |

## Errata

{Optional — omit this section entirely until this decision has its first erratum. Ungated: anyone may append a row for a change that provably leaves the rendered meaning of this decision's substantive sections (`Decision`, `Rationale`, `Impact`) unchanged. No inline marker, no `Status` change, no `Last Amended` change. See `skill/plan-lifecycle` for the errata test.}

| # | Date | Change | Author |
|---|---|---|---|
| 1 | {YYYY-MM-DD} | {What changed} | {name} |
