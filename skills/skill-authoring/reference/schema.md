# Skill Schema Reference

## Frontmatter

```yaml
---
name: 'skill-name' # Required. Kebab-case. Must match folder name.
version: '0.1.1' # Required. Semver.
description: 'One sentence.' # Required. What this skill produces.
requires_skills: # Optional. Skills a bundle install must also carry.
  - other-skill-name # Bare kebab-case name; a skill/ prefix is accepted.
---
```

### `requires_skills`

A list of skill names this skill needs. `aif install` installs the transitive closure of every bundle skill's list, so a dependency need not be listed in any agent. Cycles are allowed and silent. A name with no `skills/<name>/` folder, a non-list value, or a non-kebab-case entry (`../x`, `a/b`) is an error in `aif validate` and in bundle resolution. The field never changes an agent's `skills` or `preload_skills`.

## Skill references in prose

`aif validate skill-deps` classifies every `skill/<name>` mention in a skill's `SKILL.md` and `reference/` files (README files are not scanned; a skill's own name is never a reference):

| Class     | Form                                                                                                                                                    | Result                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Reference | An inline code span holding exactly `skill/<name>` (optionally followed by a named locator, outside the span)                                           | Error if the skill does not exist or is not in the closure of the file's `requires_skills` |
| Example   | Inside a fenced code block, inside a longer inline code span, or followed immediately by the marker `<!-- skill-ref: ignore -->` after the closing span | Ignored                                                                                    |
| Other     | Any other mention (unformatted prose, a frontmatter `description`)                                                                                      | Warning (does not fail the run)                                                            |

Declare a mention that is a real need; mark one that is only a pointer or consumer mention.

## Required Body Sections

Five sections, in this order:

1. **Purpose** — what it does, when to use it, what problem it solves
2. **Inputs** — what information is needed (`- **Name** — description and source`)
3. **Steps** — ordered procedure (`### Step N — Name`). Deterministic work → scripts, not prose. A citation from another document to one of these steps must name it (`` `skill/{name}`: "Name" ``), never cite the ordinal alone — see `steering/engineering/core.md`: "Cite, Don't Restate".
4. **Outputs** — what is produced (`- **Name** — description and destination`)
5. **Edge Cases** — how to handle failures (`- **Situation** — what to do`)

## Folder Structure

```
skills/{name}/
├── SKILL.md              ← Entry point. Always required.
├── reference/            ← Agent reads during execution.
├── assets/               ← Used in output or by scripts.
└── scripts/              ← Deterministic operations.
```

| Question                                    | Folder       |
| ------------------------------------------- | ------------ |
| Agent reads this to understand what to do?  | `reference/` |
| Copied into output or consumed by a script? | `assets/`    |
| Code that runs deterministically?           | `scripts/`   |
