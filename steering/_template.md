---
# Unique identifier for this steering file. Use kebab-case.
name: "steering-name"

# Semantic version. Start at 0.1.0 for new steering files.
version: "0.1.0"

# One-sentence description of what this enforces. Should be specific enough
# to decide relevance without reading the body.
description: "Brief description of the scope and what rules this enforces."

# Glob patterns controlling when this file is loaded.
# Empty or omitted = always loaded (unconditional).
# With patterns = loaded only when working with matching files.
#
# Harness adapters translate this to native mechanisms:
#   Kiro:       inclusion: "always" vs "fileMatch"
#   Copilot:    applyTo: "**" vs applyTo: "pattern"
#   Claude Code: no paths field vs paths: ["pattern"]
#
# When omitted, defaults to [] (always loaded).
file_patterns: []
---

## Scope

Define who this steering applies to and when.

**This steering applies to:**
- {Global: all agents, or Domain: agents in the X domain}

**Loaded when:**
- {When is this steering file loaded? e.g. "Every session start", "When working with test files"}

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
