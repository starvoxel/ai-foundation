+++
# Unique identifier for this skill. Use kebab-case.
# Example: "decision-record", "test-authoring", "chunk-decomposition"
name = "skill-name"

# Semantic version. Start at 1.0.0 for new skills.
# MAJOR.MINOR.PATCH — see AGENTS.md versioning rules.
version = "0.1.0"

# One-sentence description of what this skill produces or accomplishes.
# This is what appears in discovery scans — make it clear and specific.
description = "Brief description of what this skill does and when to use it."
+++

## Purpose

Expanded description of what this skill does and when an agent should invoke it.

This skill is useful when [condition or context]. It is not needed when [alternative condition].

---

## Inputs

What information or context the agent needs before starting this skill.

| Input | Required | Description |
|---|---|---|
| {input-name} | Yes / No | {What it is and why it's needed} |
| {input-name} | Yes / No | {What it is and why it's needed} |

---

## Steps

The ordered procedure for executing this skill. Write as clear, actionable steps.

**Step 1 — {Action}**

{What the agent does in this step. Be specific.}

**Step 2 — {Action}**

{What the agent does in this step. Be specific.}

**Step 3 — {Action}**

{What the agent does in this step. Be specific.}

---

## Outputs

What this skill produces when complete.

| Output | Format | Description |
|---|---|---|
| {output-name} | {e.g. markdown file, JSON, updated source} | {What it contains} |

---

## Edge Cases / Error Handling

How to handle failures or unusual situations.

**Scenario:** {Describe the edge case}
**Action:** {How the agent should handle it}

**Scenario:** {Describe another edge case}
**Action:** {How the agent should handle it}

---

## Notes

Any additional context that helps agents use this skill correctly:
- Assumptions about the project structure or environment
- Related skills that might be invoked before or after
- Common mistakes to avoid
