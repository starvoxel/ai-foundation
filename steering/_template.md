+++
# Unique identifier for this steering file. Use kebab-case.
# Example: "global", "engineering", "product"
name = "steering-name"

# Semantic version. Start at 1.0.0 for new steering files.
# MAJOR.MINOR.PATCH — see AGENTS.md versioning rules.
version = "0.1.0"

# One-sentence description of what domain/scope this covers and what it enforces.
# This is what appears in discovery scans — make it clear and specific.
description = "Brief description of the scope and what rules this enforces."
+++

## Scope

Define who this steering applies to and when.

**This steering applies to:**
- {Global: all agents, or Domain: agents in the X domain, or specific conditions}

**Loaded when:**
- {When is this steering file loaded? e.g. "Every session start", "When agent domain is engineering"}

---

## Rules

The enforced constraints. Write each rule as a clear imperative with no ambiguity.

Use checkboxes for rules that are verifiable conditions. Use bullet points for
behavioural rules that are always on.

### Rule 1: {Short Title}

- [ ] {Verifiable condition — e.g. "Every new file has a header comment"}
- {Behavioural rule — e.g. "Never make assumptions about ambiguous requirements"}

**Rationale:** {Why this rule exists. Helps agents apply it correctly in edge cases.}

**Exceptions:** {How to deviate if genuinely necessary. "No exceptions" is valid — state it explicitly.}

---

### Rule 2: {Short Title}

- [ ] {Verifiable condition}
- {Behavioural rule}

**Rationale:** {Why this rule exists.}

**Exceptions:** {How to deviate.}

---

### Rule 3: {Short Title}

- [ ] {Verifiable condition}
- {Behavioural rule}

**Rationale:** {Why this rule exists.}

**Exceptions:** {How to deviate.}

---

## Enforcement

How violations are handled:

- {What happens if a rule is violated — e.g. "Plan is rejected", "Review fails", "Human escalation"}
- {Who is responsible for enforcing — e.g. "Principal-Engineer during review", "Tech-Lead during planning"}

---

## Notes

Any additional context:
- Common edge cases where these rules apply
- Related steering files that complement this one
- History of why these rules were added (if relevant to understanding their intent)
