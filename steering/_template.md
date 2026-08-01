---
# Unique identifier for this steering file. Use kebab-case.
name: "steering-name"

# Semantic version. Start at 0.1.0 for new steering files.
version: "0.1.0"

# One-sentence description of what this enforces. Agents use this to decide
# whether to load the full content — make it specific.
description: "Brief description of the scope and what rules this enforces."

# Which agents should load this file. Helps agents and harnesses skip irrelevant
# steering without reading the body.
#
# Values:
#   "all"                        — Every agent in this domain/scope
#   ["agent-name", ...]          — Only these specific agents
#   { roles: ["impl", "test"] }  — Agents performing these roles
#
# When omitted, defaults to "all".
applies_to: "all"

# Kiro-compatible inclusion mode. Controls automatic loading behaviour.
#
# Values:
#   "always"    — Loaded every session (default)
#   "fileMatch" — Only loaded when working with files matching a pattern
#   "manual"    — Only loaded when explicitly added via /context add
#
# When omitted, defaults to "always".
inclusion: "always"
---

## Scope

Define who this steering applies to and when.

**This steering applies to:**
- {Global: all agents, or Domain: agents in the X domain, or specific agents/roles}

**Loaded when:**
- {When is this steering file loaded? e.g. "Every session start", "When agent domain is engineering"}

---

## Rules

The enforced constraints. Write each rule as a clear imperative with no ambiguity.

### Rule 1: {Short Title}

- {Behavioural rule — e.g. "Never make assumptions about ambiguous requirements"}

**Rationale:** {Why this rule exists. Helps agents apply it correctly in edge cases.}

**Exceptions:** {How to deviate if genuinely necessary. "No exceptions" is valid — state it explicitly.}

---

## Enforcement

How violations are handled:

- {What happens if a rule is violated}
- {Who is responsible for enforcing}
