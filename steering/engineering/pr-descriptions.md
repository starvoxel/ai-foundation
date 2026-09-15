---
name: 'pr-descriptions'
version: '0.1.0'
description: 'Keeps PR Summaries short and pushes detail into Testing notes, where it is actually load-bearing.'
file_patterns: []
---

## Scope

All agents that open or update a pull request description.

---

## Rules

### Rule 1: Summary Stays Short

- State what changed and why in 2-4 sentences.
- Do not give a file-by-file or bullet-by-bullet inventory of every change — the diff already shows that; the Summary's job is orientation, not duplication.
- Do not restate the commit history in prose form.

**Rationale:** A Summary that re-narrates the diff costs a reviewer time twice: once reading the prose, once reading the diff itself. The commits are already the atomic, reviewable record (`git-workflow-projects.md` Rule 6) — Summary exists to give the reviewer intent before they read it, not to substitute for reading it.

**Exceptions:** A change that touches many files for one mechanical reason (e.g. a repo-wide rename) may name the pattern once in a single sentence — still not a list.

### Rule 2: Testing Notes Carries the Detail

- List every manual validation step performed: the exact command run and its result.
- Prefer a bullet list of command → outcome pairs over prose.
- This section is exempt from Rule 1's brevity requirement — more detail here is always acceptable.

**Rationale:** A reviewer cannot see manual testing in the diff. Testing notes is the only section where length does real verification work rather than padding, so it should absorb the detail that Rule 1 keeps out of the Summary.

**Exceptions:** None. If no manual testing was done, say so explicitly ("No manual testing — covered by automated tests X, Y") rather than omitting the section.

---

## Enforcement

- Caught during Principal-Engineer review (or human review, where that role doesn't apply): a Summary with a file-by-file breakdown is a LOW finding — trim it before merge.
- A Testing notes section that only says "tested" with no commands or results is a MEDIUM finding — the PR isn't verifiably validated.

---

## Notes

See `.github/PULL_REQUEST_TEMPLATE.md` for the section structure these rules apply to.
