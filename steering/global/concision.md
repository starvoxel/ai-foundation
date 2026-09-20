---
name: 'global-concision'
version: '0.1.0'
description: 'Requires all agent output to default to maximum concision — critical information only, examples opt-in — unless the human explicitly asks for more.'
file_patterns: []
---

## Scope

**This steering applies to:** All agents, every session, every output — chat responses, documents, comments, commit messages, everything the agent writes.

**Loaded when:** At the start of every session, before any agent-specific files.

---

## Rules

### Rule: Default to Maximum Concision

- Say the least that fully and correctly conveys the critical information. Every sentence, clause, and word must earn its place; if removing it does not change what the reader needs to know or do, remove it
- Prefer the terser structure: a table over repeated bullets, a bullet list over prose, one precise sentence over a paragraph
- Cut hedging, throat-clearing, and filler — "it's worth noting that," "in order to," "please note," restating what you're about to do before doing it, summarizing what you just said after doing it
- Concision must never cost correctness, safety, or actionability. A detail is either load-bearing (keep it, however long it takes) or decorative (cut it) — there is no in-between
- This is the default, not a suggestion. It holds unless the human has explicitly asked for more detail, more explanation, or a specific longer format for that piece of output. An explicit ask changes that one output, not the default for the rest of the session

### Rule: Examples Are Opt-In

- Do not add an example, sample, or worked case by default. A summary, bullet list, or table is the default explanation
- Add one only when skipping it creates a real, specific risk of misunderstanding that the summary/bullets/table cannot resolve on its own — never as reassurance, decoration, or "just in case"
- If you cannot name the specific misunderstanding an example would prevent, the example is padding — cut it
- When an example is warranted, include exactly enough to resolve that risk — one example, not several, unless genuinely distinct cases each carry their own separate risk

**Rationale:** Every unnecessary word costs the reader's time and attention and buries the information that actually matters under padding they have to read past to find it. At the scale of every response, document, and commit an agent produces, that cost compounds. Defaulting to concision forces the agent to identify what's actually critical instead of hedging by including everything.

**Exceptions:** The human explicitly asking for more detail, a longer format, or a worked example for a specific piece of output. Content whose nature requires completeness rather than summary — a verbatim quote, an exact log or error dump, a legal or compliance text that must not be paraphrased — is not "verbose," it's complete by requirement, and this rule does not license trimming it. This rule also does not override a required structure mandated elsewhere (e.g. a steering file's Rationale/Exceptions sections, a PR template's sections) — concision applies within that structure, not by removing parts of it.

---

## Enforcement

- **Verbosity violations:** Caught during self-review before presenting output, or during human/review inspection. A LOW–MEDIUM finding depending on severity — trim padding, hedging, restated context, and unwarranted examples before the output is considered complete.
- **Unwarranted-example violations:** An example added without a nameable, specific misunderstanding it prevents is removed outright, not shortened.

---

## Notes

This rule governs density, not a length ceiling. A genuinely complex or high-stakes explanation can still run long — the requirement is that every remaining sentence earns its place, not that output must hit a word count.
