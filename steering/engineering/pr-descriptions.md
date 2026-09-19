---
name: 'pr-descriptions'
version: '0.3.0'
description: 'Requires PR descriptions to follow the repo PR template exactly — sections, order, and every comment instruction inside it.'
file_patterns: []
---

## Scope

All agents that open or update a pull request description, in any repository.

---

## Rules

### Rule: The Template Is Binding, Not Decorative

- If the repo has a PR template (`.github/PULL_REQUEST_TEMPLATE.md` or `.github/PULL_REQUEST_TEMPLATE/`), the PR description must include every section the template defines, in the same order, with no sections added or removed.
- Every instructional HTML comment inside the template — on length, content, or format — must be followed to the letter for that section, not treated as an optional hint. If a comment says a section should be brief, it is brief. If a comment says a section should be as detailed as the work warrants, it is detailed.
- Do not average the template's per-section guidance into one uniform style. A template that asks for a short Summary and a thorough Testing notes section means exactly that contrast, not "keep everything moderate."

**Rationale:** Putting content requirements in the template — instead of restating them as steering rules — means each repo's template is the single source of truth for what its PRs should contain, and stays repo-agnostic: one repo can ask for a terse summary and an exhaustive test log, another can require a rollback plan or a linked ticket, without touching steering. This rule's only job is making the template's own instructions binding instead of comments nobody has to honor.

**Exceptions:** A repo with no PR template file has no structure to follow — fall back to a plain Summary + Testing notes description.

---

## Enforcement

- Caught during Principal-Engineer review (or human review, where that role doesn't apply): a PR description that skips a template section, adds an undefined one, or visibly ignores a section's comment (e.g. a long file-by-file Summary when the comment calls for 2-4 sentences) is a LOW-MEDIUM finding depending on severity — send back with a pointer to the specific comment that was ignored, not a rewrite of the rule itself.

---

## Notes

The template's own comments carry the actual requirements (what each section should contain, how long, what format). This file only enforces that agents follow them — it does not duplicate them. See `.github/PULL_REQUEST_TEMPLATE.md` for this repo's current structure.
