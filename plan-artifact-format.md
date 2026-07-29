# Plan Artifact Format — Universal Schema

> Created: 2026-07-28
> Status: v0.1.0

This document defines the universal structure for all Plan artifacts, regardless of language,
framework, or project. Language and project-specific rules that populate each section live in
separate standards files that are composed on top of this schema.

See:
- `standards/` — language and stack-specific rules (e.g. `csharp-avalonia.md`)
- `projects/{ProjectName}/project-standards.md` — project-specific overrides and additions

---

## Standards Composition Order

When the Planner agent generates a plan, it applies rules in this order (later overrides earlier):

1. This universal schema (structure and mandatory rules)
2. Language/stack standards file (e.g. `csharp-avalonia.md`)
3. Project standards file (e.g. `projects/EOM-Insight/project-standards.md`)

---

## File Naming Convention

```
plans/{ProjectName}/{YYYY-MM-DD}_{###}_{ShortTitle}.plan.md
```

Example:
```
plans/EOM-Insight/2026-07-28_001_CoreDataLayer.plan.md
```

---

## Plan Artifact Template

---

### SECTION 1 — Metadata

Every plan starts with a metadata table. All fields are required.
`Parent Epic` and `Depends On` are required when the chunk belongs to an Epic.
Standalone plans (no Epic) set both to `None`.

```markdown
## Metadata
| Field          | Value                                          |
|----------------|------------------------------------------------|
| Plan ID        | {ProjectName}-{YYYY-MM-DD}-{###}               |
| Parent Epic    | {Epic ID} or None                              |
| Chunk          | {e.g. 3 of 6} or None                         |
| Depends On     | {Chunk Plan IDs this must wait for} or None    |
| Can Parallel   | {Chunk Plan IDs that can run alongside this}   |
| Project        | {Project name}                                 |
| Status         | Draft / Approved / In Progress / Done          |
| Author (Agent) | Planner                                        |
| Reviewed By    | {human name or "Pending"}                      |
| Created        | {YYYY-MM-DD HH:mm}                             |
| Last Updated   | {YYYY-MM-DD HH:mm}                             |
| Standards      | {e.g. csharp-avalonia, project-standards link} |
```

---

### SECTION 2 — Goal

One or two sentences. What does this iteration accomplish and why does it matter?
Must be written so a non-technical stakeholder can understand the value.

```markdown
## 2. Goal
{Statement of what this iteration delivers and why.}
```

---

### SECTION 3 — Scope

Forces explicit iteration boundaries. Both subsections are required.

```markdown
## 3. Scope

### In Scope
- Bullet list of exactly what will be built or changed in this iteration.

### Out of Scope
- Bullet list of things explicitly deferred to a future iteration.
- At least one item is required. If nothing is out of scope, the iteration is too large.
```

---

### SECTION 4 — Prerequisites

```markdown
## 4. Prerequisites
- [ ] {Prior plan approved and complete — link if applicable}
- [ ] {Dependencies available — packages, services, APIs}
- [ ] {Environment or configuration assumptions}
```

---

### SECTION 5 — Architecture & Design

Language-agnostic structure. The standards file fills in language-specific patterns.

```markdown
## 5. Architecture & Design

### Project Structure Changes
Describe any new files, folders, or modules being added. Use relative paths.
Show new items with ← NEW and modified items with ← MODIFIED.

### Key Design Decisions
Numbered list of significant decisions and rationale.

1. **Decision**: {What was decided}
   **Rationale**: {Why — what alternatives were considered and rejected}

### Patterns & Conventions Applied
Reference which standards apply (from standards file and project file).
List the specific patterns being used in this iteration.
```

---

### SECTION 6 — Components

The core of the plan. One sub-section per component. Must be detailed enough
for a developer to implement without ambiguity.

```markdown
## 6. Components

### {ComponentName} — {Role: e.g. Data Model / Service / Controller / View / Helper}

**File**: `{relative/path/to/file}`
**Purpose**: One sentence.

**Public Interface**:
Describe the public contract — method signatures, inputs, outputs.
Use pseudocode or the target language depending on what is clearest.
Do not write full implementations here.

**Key Behaviour**:
- What this component does
- Edge cases and how they are handled
- Error handling approach
- Threading or concurrency requirements

**Dependencies**:
- {Other component or service} — used for {reason}
```

---

### SECTION 7 — Data Models

Define the shape of any new or changed data structures.

```markdown
## 7. Data Models

### {ModelName}
**Purpose**: One sentence.

Fields:
| Field      | Type    | Required | Notes                    |
|------------|---------|----------|--------------------------|
| {name}     | {type}  | Yes/No   | {validation, constraints}|

Serialization notes, immutability requirements, validation rules.
```

---

### SECTION 8 — Security Requirements

> **MANDATORY. This section must never be empty or contain only placeholder text.**
> The standards file will provide a base checklist. Add plan-specific items here.

```markdown
## 8. Security Requirements

- [ ] {Requirement 1}
- [ ] {Requirement 2}
- [ ] {Any plan-specific security constraints not covered by the standards file}
```

Universal minimums (always required regardless of standards file):
- All external inputs are validated before use
- No secrets or credentials in source code or logs
- Errors exposed to users contain no internal system details
- Any data written to disk or transmitted is considered for sensitivity

---

### SECTION 9 — Logging Requirements

> **MANDATORY. This section must never be empty or contain only placeholder text.**
> The standards file defines the logging framework and format. This section defines
> what events this plan specifically logs.

```markdown
## 9. Logging Requirements

| Event                  | Level   | What is logged         | What is NOT logged  |
|------------------------|---------|------------------------|---------------------|
| {Event description}    | {Level} | {Safe fields only}     | {Excluded data}     |
```

Universal minimums (always required regardless of standards file):
- No PII in any log entry at any level
- Sensitive values must be masked, not omitted — use `[REDACTED]`
- Log levels must be used consistently (Debug for tracing, Info for milestones, Warning for handled issues, Error for failures, Fatal for unrecoverable)

---

### SECTION 10 — Testing Plan

```markdown
## 10. Testing Plan

### {ComponentName} Tests

| Test ID  | Description                   | Type        | Pass Criteria               |
|----------|-------------------------------|-------------|-----------------------------|
| {ID}-T01 | {Happy path}                  | Unit        | {Expected result}           |
| {ID}-T02 | {Null / empty input}          | Unit        | {Expected exception/result} |
| {ID}-T03 | {Integration scenario}        | Integration | {End-to-end behaviour}      |
```

The standards file specifies the testing framework. This section defines the test cases
for this specific plan. At minimum, every public method must have a happy-path test and
at least one failure/edge-case test.

---

### SECTION 11 — Documentation Requirements

```markdown
## 11. Documentation Requirements

- [ ] Inline documentation on all public members (format per standards file)
- [ ] File/module headers on all new source files (format per standards file)
- [ ] README updated if the feature is user-facing
- [ ] CHANGELOG entry: `{YYYY-MM-DD} | {Plan ID} | {Short description}`
- [ ] {Any plan-specific documentation needs}
```

---

### SECTION 12 — Acceptance Criteria

The iteration is complete when ALL of the following are true. Add plan-specific
criteria after the universal ones.

```markdown
## 12. Acceptance Criteria

Universal:
- [ ] All components in Section 6 exist and build cleanly with no errors
- [ ] All test cases in Section 10 pass
- [ ] Security checklist in Section 8 is fully satisfied
- [ ] Logging checklist in Section 9 is fully satisfied
- [ ] Documentation checklist in Section 11 is fully satisfied
- [ ] Reviewer agent has approved with no outstanding HIGH or CRITICAL findings
- [ ] Human review sign-off received
- [ ] CHANGELOG updated
- [ ] Work log entry written

Plan-specific:
- [ ] {Additional criteria specific to this iteration}
```

---

### SECTION 13 — Risks & Open Questions

```markdown
## 13. Risks & Open Questions

| # | Risk / Question       | Impact | Mitigation / Decision Needed By |
|---|-----------------------|--------|---------------------------------|
| 1 | {Describe risk}       | H/M/L  | {Mitigation or who decides}     |
```

---

### SECTION 14 — Work Log

Auto-populated by agents as the plan progresses. Never manually edited.
Format is fixed so it is machine-readable for the self-improvement pipeline.

```markdown
## 14. Work Log

[{YYYY-MM-DD HH:mm}] [Tech-Lead]              [Plan Created]            [{Plan ID}] [Status: Draft]
[{YYYY-MM-DD HH:mm}] [Human]                  [Plan Approved]           [{Plan ID}] [Status: Approved]
[{YYYY-MM-DD HH:mm}] [Software-Engineer]      [Implementation Started]  [{Plan ID}]
[{YYYY-MM-DD HH:mm}] [Principal-Engineer]     [Review Complete]         [{Plan ID}] [Findings: {n} HIGH, {n} MED, {n} LOW]
[{YYYY-MM-DD HH:mm}] [Software-Engineer]      [Corrections Applied]     [{Plan ID}] [Issues Resolved: {n}]
[{YYYY-MM-DD HH:mm}] [Test-Engineer]          [Tests Passed]            [{Plan ID}] [Tests: {pass}/{total}]
[{YYYY-MM-DD HH:mm}] [Engineering-Tech-Writer][Documentation Complete]  [{Plan ID}]
[{YYYY-MM-DD HH:mm}] [Human]                  [Iteration Signed Off]    [{Plan ID}] [Status: Done]
```

---

## Agent Behaviour Rules (Universal)

These rules apply to all agents regardless of language or project.

### Tech-Lead Must:
- Never leave Section 8 (Security) or Section 9 (Logging) empty
- Always list at least one Out of Scope item in Section 3
- Write component interfaces/contracts before considering implementation details
- Reference which standards files are active in the Metadata

### Principal-Engineer Must:
- Check that the active standards file conventions are followed
- Flag any security or logging violation as HIGH severity — not lower
- Not approve a plan with empty or boilerplate-only Section 8 or 9

### Software-Engineer Must:
- Not begin implementation until Plan status is `Approved`
- Implement only what is described in the Plan — scope additions go back to Tech-Lead
- Add a reference comment at the top of each new file linking to the Plan ID

### Test-Engineer Must:
- Write tests before marking acceptance criteria as passing
- Report results to the Work Log in the format defined in Section 14

### Engineering-Tech-Writer Must:
- Follow the documentation format defined in the active standards file
- Write a CHANGELOG entry for every completed plan

---

## What Goes in the Standards Files (Not Here)

The following belong in `standards/{stack}.md` or `projects/{name}/project-standards.md`,
not in this base schema:

- Programming language syntax for interfaces, models, method signatures
- Specific naming conventions (PascalCase, camelCase, prefixes, suffixes)
- Framework-specific patterns (MVVM, MVC, ReactiveUI, etc.)
- Specific libraries and packages to use
- File header / copyright block format
- Inline documentation format (XML docs, JSDoc, docstrings, etc.)
- Testing framework and mocking library choices
- Logging framework and structured log format
- Build and packaging instructions
