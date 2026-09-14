# AI Engineering Plan Schema

A Tier 3 plan is a structured outline saved to the repo and committed for human approval. It is concise and actionable — not a design document.

---

## Required Sections

### Metadata

A header block, not a full table, since this plan type is lighter-weight than a Chunk/Epic Plan:

```
> Status: Draft
> Created: {YYYY-MM-DD}
> Approved by: Pending
```

Status values: `Draft / Approved / Done / Deferred` — see `skills/plan-lifecycle/reference/status-vocabulary.md` for the canonical vocabulary.
Follow `skill/plan-lifecycle` for the commit-gate procedure: save with `Status: Draft` and commit before presenting, commit each revision, and commit the `Approved` (or `Deferred`) decision before implementation begins.

### Goal

One or two sentences stating what this work accomplishes.

### Components Affected

Table or list of components that will be created, modified, or removed:

| Component                   | Action | Notes                      |
| --------------------------- | ------ | -------------------------- |
| `agents/example.yaml`       | Modify | Adding new skill reference |
| `skills/new-thing/SKILL.md` | Create | New procedure for X        |

### Approach

Numbered steps describing the implementation order. Each step should be independently verifiable. Include:

- What is created or changed
- Why (brief rationale if non-obvious)
- Dependencies between steps

### Open Questions

Items that need human input before or during implementation. If none, state "None."

### Risks

What could go wrong or what trade-offs are being made. If none, state "None."

### Validation

How the work will be verified after implementation:

- Which tests will be run
- What cross-references will be checked
- Any manual verification needed

### Out of Scope

What this plan explicitly does NOT cover. Prevents scope creep during implementation.

---

## Guidelines

- Keep the plan to roughly one screen of content. If it's longer, the work should probably be split.
- Be specific about file paths and component names — the plan should be unambiguous about what gets created/changed.
- Risks should be genuine, not padding. "None" is a valid answer.
- Open questions should block implementation if unanswered. Don't list questions you can answer yourself.
