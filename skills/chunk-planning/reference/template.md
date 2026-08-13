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
| Status | Draft / Approved / In Progress / Done |
| Author (Agent) | Tech-Lead |
| Reviewed By | {human name or "Pending"} |
| Created | {YYYY-MM-DD HH:mm} |
| Last Updated | {YYYY-MM-DD HH:mm} |
| Standards | {e.g. csharp-avalonia, project-standards link} |

---

## 2. Goal

{One or two sentences. What does this chunk accomplish?}

---

## 3. Scope

### In Scope
- {Exactly what will be built in this chunk}

### Out of Scope
- {Explicitly deferred — at least one required}

---

## 4. Prerequisites

- [ ] {Prior chunk complete — link if applicable}
- [ ] {Dependencies available}
- [ ] {Environment assumptions}

---

## 5. Architecture & Design

### Project Structure Changes
{New files/folders. Mark with ← NEW or ← MODIFIED.}

### Key Design Decisions
1. **Decision**: {What}
   **Rationale**: {Why}

### Patterns & Conventions Applied
{Which standards patterns are being used.}

---

## 6. Components

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

## 7. Data Models

### {ModelName}

**Purpose**: {One sentence.}

| Field | Type | Required | Notes |
|---|---|---|---|
| {name} | {type} | Yes/No | {constraints} |

---

## 8. Security Requirements

> This section must never be empty.

- [ ] All external inputs validated before use
- [ ] No secrets or credentials in source code or logs
- [ ] Errors exposed to users contain no internal system details
- [ ] {Plan-specific security requirements}

---

## 9. Logging Requirements

> This section must never be empty.

| Event | Level | What is logged | What is NOT logged |
|---|---|---|---|
| {Event} | {Level} | {Safe fields} | {Excluded data} |

---

## 10. Testing Plan

### {ComponentName} Tests

| Test ID | Description | Type | Pass Criteria |
|---|---|---|---|
| {ID}-T01 | {Happy path} | Unit | {Expected result} |
| {ID}-T02 | {Failure case} | Unit | {Expected exception} |

---

## 11. Documentation Requirements

- [ ] Inline documentation on all public members
- [ ] File headers on all new source files
- [ ] README updated if user-facing
- [ ] CHANGELOG entry written

---

## 12. Acceptance Criteria

- [ ] All components in Section 6 exist and build cleanly
- [ ] All tests in Section 10 pass
- [ ] Security checklist (Section 8) fully satisfied
- [ ] Logging checklist (Section 9) fully satisfied
- [ ] Documentation checklist (Section 11) fully satisfied
- [ ] Review approved with no CRITICAL or HIGH findings
- [ ] {Plan-specific criteria}

---

## 13. Risks & Open Questions

| # | Risk / Question | Impact | Mitigation |
|---|---|---|---|
| 1 | {Describe} | H/M/L | {Mitigation or decision needed} |

---

## 14. Work Log

{Auto-populated by agents. Format:}
[{YYYY-MM-DD HH:mm}] [{Agent}] [{Action}] [{Plan ID}] [{Details}]
