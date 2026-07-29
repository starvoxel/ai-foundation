# Epic Plan Format

> Created: 2026-07-28
> Status: v1.1

An Epic Plan describes a large, complete feature or deliverable at a level a developer
can read, understand, and give feedback on. It does not contain implementation detail —
that lives in Chunk Plans.

The Tech-Lead agent produces an Epic first. A human approves it. The Tech-Lead then
decomposes it into Chunk Plans. No Chunk Plan is created until the Epic is approved.

---

## Relationship to Other Plan Types

```
Product Requirements  (owned by Prod domain — optional input to Epic)
    └── informs →  Epic Plan  (APPROVED by human before any chunks are written)
                       └── decomposed into →  Chunk Plans  (executable by agents)
                                                  ├── Chunk 001  (no deps — starts immediately)
                                                  ├── Chunk 002  (no deps — parallel to 001)
                                                  ├── Chunk 003  (depends on 001)
                                                  └── Chunk 004  (depends on 002 and 003)
```

The Epic owns the overall goal. Chunks own the execution.
A Chunk Plan references its parent Epic by ID.

---

## File Naming Convention

```
plans/{ProjectName}/epics/{YYYY-MM-DD}_{###}_{ShortTitle}.epic.md
```

Chunk Plans that belong to an Epic:
```
plans/{ProjectName}/{EpicID}/chunks/{###}_{ShortTitle}.plan.md
```

Example:
```
plans/EOM-Insight/epics/2026-07-28_001_DashboardScreen.epic.md
plans/EOM-Insight/EomInsight-2026-07-28-001/chunks/001_DataModels.plan.md
plans/EOM-Insight/EomInsight-2026-07-28-001/chunks/002_ServiceInterfaces.plan.md
plans/EOM-Insight/EomInsight-2026-07-28-001/chunks/003_ViewModel.plan.md
```

---

## Epic Plan Template

---

### SECTION 1 — Metadata

```markdown
## Metadata
| Field               | Value                                           |
|---------------------|-------------------------------------------------|
| Epic ID             | {ProjectName}-{YYYY-MM-DD}-{###}                |
| Project             | {Project name}                                  |
| Status              | Draft / Approved / In Progress / Done           |
| Author (Agent)      | Tech-Lead                                       |
| Reviewed By         | {human name or "Pending"}                       |
| Created             | {YYYY-MM-DD HH:mm}                              |
| Last Updated        | {YYYY-MM-DD HH:mm}                              |
| Standards           | {e.g. csharp-avalonia, project-standards link}  |
| Total Chunks        | {n — filled in after decomposition}             |
| Product Requirement | {PRD ID / link, or "None"}                      |
| Decision Records    | {Decision Record ID(s), or "None"}              |
```

The `Product Requirement` field links this Epic to a formal requirements document
produced by the Prod domain (e.g. a PRD or user story set from `Prod-Planner`).
When present, the Epic must not contradict the linked requirements. Conflicts
are raised as open questions in Section 7 before decomposition begins.

---

### SECTION 2 — Goal

What is being built and why? Written for a developer or stakeholder audience.
Two to four sentences max. Should answer:
- What does the user get at the end of this epic?
- What problem does it solve?

If a Product Requirement is linked, the Goal must be traceable to it —
quote or paraphrase the requirement being implemented.

```markdown
## 2. Goal
{Statement.}

> Requirement traceability: {PRD ID / section reference, or "N/A — no PRD linked"}
```

---

### SECTION 3 — Scope

```markdown
## 3. Scope

### In Scope
- {High-level feature or capability included}

### Out of Scope
- {Explicitly deferred things — at least one required}
- {Future epics that are related but not included here}

### Requirements Coverage
If a PRD is linked, list which requirements are addressed by this epic
and which are deferred to future epics.

| Requirement ID | Description              | Status in this Epic         |
|----------------|--------------------------|-----------------------------|
| {PRD-001}      | {Short description}      | Addressed / Deferred / N/A  |
```

---

### SECTION 4 — Feature Description

Describe the feature in enough detail for a developer to understand it fully
without needing to ask questions. This is the main reviewable content of the Epic.

Subsections vary by feature type. Common subsections:

```markdown
## 4. Feature Description

### User-Facing Behaviour
What does the user see and do? Walk through the experience.
If UI is involved, describe each screen state, interaction, and transition.
Reference any wireframes, mockups, or design artifacts from the PRD if available.

### Data Flow
How does data move through the system for this feature?
Entry point → processing → output / storage.

### Business Rules
Constraints and logic that must be enforced:
- {Rule 1: e.g. "A user cannot save an empty record"}
- {Rule 2}

### Error States
What can go wrong and what should happen:
| Scenario                  | Expected Behaviour                         |
|---------------------------|--------------------------------------------|
| {e.g. File not found}     | {Show user-friendly message, log warning}  |
```

---

### SECTION 5 — Architecture Overview

High-level only. No signatures, no implementation. Answers the question:
"What new pieces are being added to the system and how do they connect?"

```markdown
## 5. Architecture Overview

### New Components
| Component  | Type                          | Responsibility  |
|------------|-------------------------------|-----------------|
| {Name}     | {Model/Service/ViewModel/View}| {One sentence}  |

### Component Relationships
Describe how components interact. A simple diagram or bullet list is fine.

### Integration Points
How does this feature connect to existing parts of the system?
- {Existing service or component} — used for {reason}
```

---

### SECTION 6 — Security Considerations

High-level security concerns for the entire epic. Chunk Plans will have the
detailed checklists — this section identifies the concerns that need to be
addressed across the epic.

```markdown
## 6. Security Considerations
- {Concern 1 and which chunks will address it}
- {Concern 2}
```

---

### SECTION 7 — Open Questions

Questions that must be resolved before or during decomposition into chunks.
The Tech-Lead must not create Chunk Plans while any HIGH priority question is open.

Sources of open questions include: ambiguities in the PRD, gaps in the feature
description, unresolved architecture decisions, or conflicting requirements.

```markdown
## 7. Open Questions

| # | Question                        | Priority | Source         | Raised By     | Resolved |
|---|---------------------------------|----------|----------------|---------------|----------|
| 1 | {Question}                      | H/M/L    | {PRD/Design/Arch} | {Agent/Human} | No    |
```

---

### SECTION 8 — Chunk Decomposition

Filled in by the Tech-Lead after Epic approval. Shows the full execution plan
including which chunks can run in parallel.

```markdown
## 8. Chunk Decomposition

| Chunk | Title                    | Depends On    | Can Parallel With | Agent(s)                              |
|-------|--------------------------|---------------|-------------------|---------------------------------------|
| 001   | {Title}                  | None          | 002               | Software-Engineer                     |
| 002   | {Title}                  | None          | 001               | Software-Engineer                     |
| 003   | {Title}                  | 001           | —                 | Software-Engineer, Test-Engineer      |
| 004   | {Title}                  | 001, 002      | —                 | Software-Engineer                     |
| 005   | {Title}                  | 003, 004      | —                 | Engineering-Tech-Writer               |

Parallelization notes:
- {Any constraints on what can actually run in parallel given your environment}
```

---

### SECTION 9 — Acceptance Criteria

The epic is complete when ALL chunk acceptance criteria are met plus these
epic-level criteria.

```markdown
## 9. Acceptance Criteria

- [ ] All chunks complete and signed off
- [ ] Feature works end-to-end as described in Section 4
- [ ] All requirements in Section 3 Requirements Coverage table are Addressed or intentionally Deferred
- [ ] No HIGH or CRITICAL findings open in any chunk review
- [ ] Epic-level CHANGELOG entry written
- [ ] {Epic-specific criteria}
```

---

### SECTION 10 — Work Log

Auto-populated by agents. Never manually edited.

```markdown
## 10. Work Log

[{YYYY-MM-DD HH:mm}] [Tech-Lead]  [Epic Created]        [{Epic ID}] [Status: Draft]
[{YYYY-MM-DD HH:mm}] [Human]      [Epic Approved]        [{Epic ID}] [Status: Approved]
[{YYYY-MM-DD HH:mm}] [Tech-Lead]  [Chunks Decomposed]    [{Epic ID}] [Chunks: {n}]
[{YYYY-MM-DD HH:mm}] [Human]      [Chunks Approved]      [{Epic ID}]
[{YYYY-MM-DD HH:mm}] [Tech-Lead]  [Chunk {n} Created]    [{Chunk Plan ID}]
...
[{YYYY-MM-DD HH:mm}] [Human]      [Epic Signed Off]      [{Epic ID}] [Status: Done]
```

---

## Agent Behaviour Rules for Epics

### Tech-Lead Must:
- Create the Epic before any Chunk Plans
- Not create Chunk Plans until the Epic status is `Approved`
- Not create Chunk Plans while any HIGH priority open question exists in Section 7
- Check the linked PRD (if any) for conflicts before writing Sections 2–5
- Raise conflicts with the PRD as HIGH priority open questions — never silently override
- Identify parallelization opportunities explicitly in Section 8
- Keep the Epic at feature-level detail — no method signatures or implementation specifics
- Use correct agent names (`Software-Engineer`, `Test-Engineer`, etc.) in Section 8

### Human Review of the Epic Should Check:
- Does the Goal match what was actually requested / the linked PRD?
- Is anything missing from Scope that should be included?
- Are the Out of Scope items correct deferrals or accidental omissions?
- Do the business rules in Section 4 reflect real requirements?
- Are the Requirements Coverage rows accurate?
- Are the Open Questions in Section 7 answerable before work begins?

### Relationship to Chunk Plans:
- Each Chunk Plan references its parent Epic ID in metadata
- A Chunk Plan's scope must be a strict subset of the Epic's scope
- If a Chunk discovers work not in the Epic, it must pause and raise an open
  question on the Epic — not silently expand scope

---

## Future: Product Requirement Documents (PRDs)

PRDs are owned by the Prod domain (e.g. `Prod-Planner`, `Prod-Researcher`).
They are inputs to Epics, not outputs. The format for PRDs will be defined
separately under `ai-foundation/prod-domain/` when that domain is built out.

A PRD may contain:
- User stories or job-to-be-done statements
- Acceptance criteria from a product perspective
- Wireframes or design references
- Priority and business justification
- Non-functional requirements (performance, accessibility, etc.)

When a PRD exists, the Tech-Lead reads it and maps it to the Epic.
The Epic does not copy the PRD — it references it and translates product
requirements into engineering scope.
