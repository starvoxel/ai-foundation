---
name: 'pr-descriptions'
version: '0.4.0'
description: 'Requires PR descriptions to follow the repo PR template exactly — sections, order, and every comment instruction inside it.'
file_patterns: []
---

## Scope

All agents that open or update a pull request description.

---

## Rules

### Rule: The Template Is Binding, Not Decorative

- If the repo has a PR template (`.github/PULL_REQUEST_TEMPLATE.md` or `.github/PULL_REQUEST_TEMPLATE/`), include every section it defines, in order, adding and removing none
- Follow each section's instructional comment to the letter (length, content, format). Do not average the guidance into one uniform style
- With no template, write a plain Summary and Testing notes

**Rationale:** The template is each repo's single source of truth for what its PRs contain; this rule only makes its instructions binding.

**Exceptions:** None.

---

## Enforcement

A description that skips a section, adds one, or ignores a section's comment is a LOW–MEDIUM finding; send it back citing the comment.
