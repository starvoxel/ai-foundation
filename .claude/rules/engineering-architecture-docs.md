---
paths:
  - "**/architecture/**/*.md"
---

## Scope

All agents with `domain = "engineering"` while creating or editing arc42 section files under `{paths.architecture}`. The main engineering agent starts a new section when new mechanism warrants one and keeps existing sections current.

---

## Rules

### Rule: Frontmatter Schema

Every section file under `{paths.architecture}` (default `knowledge/architecture`, flat — arc42 numbers its own sub-levels) opens with:

```yaml
---
section: '05.01' # zero-padded ("01", "05"), or "05.01" for a §5 white-box sub-section
title: 'Bundle resolution'
lifecycle: published # draft | published — completion, not currency
tags: [install, bundles]
key_files:
  - lib/resolver.js
  - lib/commands/install.js
---
```

- `lifecycle` is the only currency-adjacent value an author sets. Never write `current` or `stale`; those are computed from git
- The one-line summary is a blockquote after the H1, never a frontmatter field
- Structured values only; prose stays in the body

**Rationale:** Structured frontmatter lets tooling build an index and a staleness check without parsing prose.

**Exceptions:** None.

### Rule: key_files Scope

List a file only if a change to that file's logic would make the doc's claims wrong. Leave out callers and consumers, test files, and incidentally touched config or types.

**Rationale:** The staleness check tests whether a listed file changed. Padding the list turns every unrelated refactor into noise; a list that is too narrow hides real drift.

**Exceptions:** None.

### Rule: key_files Split Trigger — No Hard Cap

There is no maximum length. Past 5 entries, treat each addition as a prompt to ask whether the section should split into finer `NN.MM` subsections. Weighing it and deciding not to split is a valid outcome.

**Rationale:** Short lists keep a rename or deletion a meaningful signal, but forcing a split to hit a number produces sections with no coherent boundary.

**Exceptions:** None.

---

## Enforcement

A section missing a required field or using a freeform `lifecycle` is MEDIUM. A `key_files` entry that is a caller, test, or incidental file is LOW. A list past 5 entries with no sign the split question was weighed is LOW.
