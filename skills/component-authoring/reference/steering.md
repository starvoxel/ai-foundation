# Authoring a steering file

Steering files are always-on rules that apply unconditionally within a scope. They constrain; they do not walk through steps. File: `steering/{scope}/{name}.md`; schema in `steering-schema.yaml`.

## Scope

| Scope               | Directory            | Loaded                                                                                                        |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| All agents          | `steering/global/`   | Every session                                                                                                 |
| Domain agents       | `steering/{domain}/` | When an agent's domain matches                                                                                |
| Generic (catch-all) | `steering/generic/`  | Only when a bundle lists the file in its `steering:` field (for example the gmail server's required steering) |

Agent-specific rules go in the agent's `prompt`, not here. Anything with ordered steps is a skill.

## Rules

- Head each rule `### Rule: Name` with no number. Rules are independent and unordered; a citation must name the rule, never a number
- Each rule has a clear imperative, a **Rationale**, and **Exceptions** (or an explicit "None")
- An **Enforcement** section says who catches a violation, how severe it is, and what happens
- `file_patterns`: omit or `[]` for always-on; globs for rules that apply only when working with certain files
- Do not contradict another steering file; resolve conflicts explicitly
- Always-on means always paid for in context: prefer fewer, shorter rules, and cite other files instead of restating them

## Checklist

- [ ] Correct scope directory; frontmatter has `name` (kebab-case), `version`, `description`
- [ ] Every rule is `### Rule: Name`, with rationale and exceptions
- [ ] An Enforcement section exists
- [ ] No procedural steps and no agent-specific rules
