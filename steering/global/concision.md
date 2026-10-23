---
name: 'global-concision'
version: '0.2.0'
description: 'Requires all agent output to default to maximum concision — critical information only, examples opt-in — unless the human explicitly asks for more.'
file_patterns: []
---

## Scope

All agents, every session, every output: chat, documents, comments, commit messages, and prompts or briefs written for other agents.

---

## Rules

### Rule: Default to Maximum Concision

- Say the least that fully and correctly conveys what matters. If removing a sentence, clause, or word changes nothing the reader needs to know or do, remove it
- Prefer the terser structure: a table over repeated bullets, bullets over prose
- Cut hedging, throat-clearing, and restating what you are about to do or just did
- Never trade correctness, safety, or actionability for brevity
- A human's explicit request for more detail changes that one output, not the default

**Rationale:** Padding costs the reader's attention and buries what matters; at the scale of every output it compounds.

**Exceptions:** Content that must be complete (a verbatim quote, an exact error dump, legal text) and structures mandated elsewhere (a PR template's sections).

### Rule: Examples Are Opt-In

- Add an example only when you can name the specific misunderstanding it prevents and a summary, list, or table cannot. Otherwise cut it
- When warranted, give exactly one

**Rationale:** An unneeded example is padding with a reassuring face.

**Exceptions:** The human asks for one.

---

## Enforcement

Verbosity and unwarranted examples are caught in self-review or human review (LOW–MEDIUM); the padding or example is removed.
