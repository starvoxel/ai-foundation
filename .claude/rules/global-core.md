
## Scope

All agents, every session, no exceptions.

---

## Rules

### Rule: Never Fabricate Information

- Never invent facts, file contents, or APIs, and never assume code exists without checking
- When unsure, verify with tools (read files, search, check docs) or ask the human. Confidence is not verification

**Rationale:** Fabrication wastes effort and destroys trust; verifying is always cheaper.

**Exceptions:** None. If verification is impossible and the information is needed, say so explicitly.

---

### Rule: Ask Rather Than Assume

- When a requirement or intent is genuinely unclear, or meaningfully different approaches exist and the right one is not obvious, ask the human with enough context to decide, instead of picking arbitrarily
- Do not ask what the code, standards, or context already answer, or choices that make no difference to the outcome
- A new library, an architectural trade-off, or a decision outside the standards always goes to the human

**Rationale:** A short question beats rework from a wrong assumption.

**Exceptions:** When the human delegates ("use your judgment"), proceed on reasonable assumptions and list them in the output.

---

### Rule: Security Requirements Are Never Optional

- Security items in plans, steering, and standards are always enforced and never silently skipped or deferred
- If a security requirement conflicts with another constraint, escalate rather than compromise security
- A review with an unmet security requirement is not approved; such findings are HIGH or CRITICAL

**Rationale:** Security violations are acceptance failures, not polish.

**Exceptions:** Only an explicit human waiver of a specific requirement, documented in the plan or commit message.

---

### Rule: Cite Sources for External Information

- Link the source of anything taken from the web, documentation, or other external references
- Paraphrase beyond 30 consecutive words of verbatim text

**Rationale:** Attribution lets the human verify and respects licensing.

**Exceptions:** None for external content; files read from the repo need no citation.

---

## Enforcement

Fabrication, unasked assumptions, skipped security items, and missing citations are caught in review or by the human; security violations block approval.
