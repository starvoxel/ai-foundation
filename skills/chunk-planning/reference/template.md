# Chunk Plan: {Short Title}

## 1. Metadata

| Field | Value |
|---|---|
| Plan ID | {EpicID}-{ChunkNumber} |
| Parent Epic | {Epic ID} or None |
| Chunk | {e.g. 3 of 6} or None |
| Depends On | {Chunk Plan IDs} or None |
| Can Parallel | {Chunk Plan IDs} or None |
| Project | {Project name} |
| Status | Draft / Approved / Done / Deferred |
| Author (Agent) | Tech-Lead |
| Reviewed By | {human name or "Pending"} |
| Created | {YYYY-MM-DD HH:mm} |
| Last Updated | {YYYY-MM-DD HH:mm} |
| Standards | {e.g. csharp-avalonia, project-standards link} |

---

## 2. Goal

{One or two sentences. What does this chunk accomplish?}

---

## 3. Quick Summary

**Open Items:** {N} open ({H} High / {M} Medium / {L} Low) — see Section 14

---

## 4. Acceptance Criteria

- [ ] All components in Section 8 exist and build cleanly
- [ ] All tests in Section 11 pass
- [ ] Security checklist (Section 9) fully satisfied
- [ ] Logging checklist (Section 10) fully satisfied
- [ ] Documentation checklist (Section 12) fully satisfied
- [ ] Review approved with no CRITICAL or HIGH findings
- [ ] {Plan-specific criteria}

---

## 5. Scope

### In Scope
- {Exactly what will be built in this chunk}

### Out of Scope
- {Explicitly deferred — at least one required}

---

## 6. Prerequisites

- [ ] {Prior chunk complete — link if applicable}
- [ ] {Dependencies available}
- [ ] {Environment assumptions}

---

## 7. Architecture & Design

### Project Structure Changes
{New files/folders. Mark with ← NEW or ← MODIFIED.}

### Key Design Decisions
1. **Decision**: {What}
   **Rationale**: {Why}

> **Tier C decisions.** Not every decision needs a standalone Decision Record —
> most don't. Before writing a decision in this section, run it through
> `skill/decision-triage`'s promotion threshold. If it doesn't rise to Tier A
> (`skill/decision-record`) or Tier B (`skill/decision-brief`), it stays here as
> a Tier C entry: no standalone file, no `{paths.decisions}/index.json` update, no
> separate approval gate — it rides this Chunk Plan's own `skill/plan-lifecycle`
> cycle. Use the convention: `Decision: {what was decided}. **Why:** {rationale}.`
> If a later, unrelated plan needs to cite this decision independently, it
> should be promoted via `skill/decision-triage`, not silently re-explained.

### Patterns & Conventions Applied
{Which standards patterns are being used.}

---

## 8. Components

### {ComponentName} — {Role}

**File**: `{relative/path/to/file}`
**Purpose**: {One sentence.}

**Public Interface**:
{Method signatures, inputs, outputs. Enough to implement without ambiguity.}

**Key Behaviour**:
- {What it does}
- {Edge cases}
- {Error handling}

**Dependencies**:
- {Component or service} — for {reason}

---

## 9. Data Models

### {ModelName}

**Purpose**: {One sentence.}

| Field | Type | Required | Notes |
|---|---|---|---|
| {name} | {type} | Yes/No | {constraints} |

---

## 10. Security Requirements

> This section must never be empty.

- [ ] All external inputs validated before use
- [ ] No secrets or credentials in source code or logs
- [ ] Errors exposed to users contain no internal system details
- [ ] {Plan-specific security requirements}

---

## 11. Logging Requirements

> This section must never be empty.

| Event | Level | What is logged | What is NOT logged |
|---|---|---|---|
| {Event} | {Level} | {Safe fields} | {Excluded data} |

---

## 12. Testing Plan

### {ComponentName} Tests

| Test ID | Description | Type | Pass Criteria |
|---|---|---|---|
| {ID}-T01 | {Happy path} | Unit | {Expected result} |
| {ID}-T02 | {Failure case} | Unit | {Expected exception} |

---

## 13. Documentation Requirements

- [ ] Inline documentation on all public members
- [ ] File headers on all new source files
- [ ] README updated if user-facing
- [ ] CHANGELOG entry written

---

## 14. Risks & Open Questions

| # | Risk / Question | Type | Impact | Mitigation |
|---|---|---|---|---|
| 1 | {Describe} | Risk/Question | H/M/L | {Mitigation or decision needed} |

---

## 15. Work Log

{Auto-populated by agents. Format:} [{YYYY-MM-DD HH:mm}] [{Agent}] [{Action}] [{Plan ID}] [{Details}]
