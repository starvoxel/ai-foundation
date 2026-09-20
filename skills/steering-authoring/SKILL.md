---
name: 'steering-authoring'
version: '0.3.1'
description: 'Creates a well-formed steering file with enforced rules, rationale, and exceptions.'
---

## Purpose

Creates a new steering file in `steering/`. Steering files define always-on rules that apply unconditionally to agents within a scope. They are not procedures — they enforce constraints, not steps.

Use this skill when adding new behavioural rules for agents in a global or domain scope.

---

## Inputs

- **Rule set** — what behaviours to enforce
- **Scope** — global (all agents) or a specific domain (e.g. `engineering`)
- **Whether conditional loading is needed** — always-on vs file-pattern-triggered

---

## Steps

### Step 1 — Determine scope and location

| Scope               | Directory            | When loaded                                                                                                                                                                        |
| ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All agents          | `steering/global/`   | Every session                                                                                                                                                                      |
| Domain agents       | `steering/{domain}/` | When agent's domain matches                                                                                                                                                        |
| Generic (catch-all) | `steering/generic/`  | Non-global, non-domain-specific rules. Whenever a bundle explicitly lists the file in its `steering:` field — not domain-matched (e.g. `steering/generic/` for the `gmail` server) |

Agent-specific rules do NOT go in steering — they go in the agent's `prompt` field.

### Step 2 — Create the file

Create `steering/{scope}/{name}.md`. Use the schema in `skills/steering-authoring/reference/schema.yaml`.

### Step 3 — Write rules

Each rule must have:

- **Clear imperative** — unambiguous statement of what must or must not happen
- **Rationale** — why it exists (helps agents apply it in edge cases)
- **Exceptions** — how to deviate, or explicit "No exceptions"

Head each rule `### Rule: Name` — no number. Rules are independent and unordered, so a number would only be a drift risk, not useful information; a citation from another document to one of these rules must name it (`` `steering/{path}.md`: "Name" ``), never by number — see `steering/engineering/core.md`: "Cite, Don't Restate".

Rules without rationale are unenforceable. Rules without exceptions are absolute.

### Step 4 — Write enforcement section

Define what happens when a rule is violated:

- Who catches it (review, automated check, human)
- What severity it carries
- What action is taken

### Step 5 — Set file_patterns (if conditional)

- Omit or set `[]` for always-loaded rules
- Set glob patterns for rules that only apply when working with certain files

### Step 6 — Self-validate

- [ ] File is in the correct scope directory
- [ ] Frontmatter has `name`, `version`, `description`
- [ ] `name` is kebab-case
- [ ] Every rule is headed `### Rule: Name` — no number
- [ ] Every rule has a rationale
- [ ] Every rule has an exceptions process
- [ ] Enforcement section exists
- [ ] No procedural steps (that's a skill, not steering)
- [ ] No agent-specific rules (those go in the agent's prompt)
- [ ] Every citation of another skill, agent, or doc is checked against `steering/engineering/core.md`: "Cite, Don't Restate"

---

## Outputs

- **`steering/{scope}/{name}.md`** — the steering file

---

## Edge Cases

- **Rule is agent-specific** — put it in the agent's `prompt` field, not in steering.
- **Rule is a procedure** — if it has ordered steps, it's a skill, not steering.
- **Unclear whether global or domain** — if it only makes sense for agents writing code, it's domain. If it applies to planning, writing, and review agents equally, it's global.
- **Rule conflicts with existing steering** — resolve the conflict explicitly. Don't create contradictory rules across files.
