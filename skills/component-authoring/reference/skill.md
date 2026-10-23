# Authoring a skill

A skill is a reusable, self-contained procedure: inputs, steps, outputs. It has no identity, domain, or hard rules; an agent invokes it when a task needs it. Folder: `skills/{name}/`.

## Layout

```
skills/{name}/
├── SKILL.md      ← The procedure. Always required.
├── reference/    ← Material the agent reads while executing (schemas, templates, examples)
├── assets/       ← Files copied into the output or consumed by scripts
└── scripts/      ← Deterministic operations, run through the shell tool
```

## SKILL.md

Frontmatter: `name` (kebab-case, matches the folder), `version` (semver), `description` (one sentence, and it must say when to use the skill, since that is what an agent sees before loading it). Optional `requires_skills` lists skills it depends on.

Five body sections, in order: **Purpose**, **Inputs**, **Steps**, **Outputs**, **Edge Cases**. Steps are headed `### Step N — Name`; a citation from another document must name the step, never give the number alone (`steering/generic/citation-rules.md`: "Cite, Don't Restate").

## Rules

- **Self-contained and generic:** no references to a specific agent or project; project details arrive as inputs
- **One job:** if it covers several distinct procedures, split it
- **Script the deterministic:** anything expressible as "run this and check the exit code" is a script, not prose. Judgment and creative work stay as prose steps
- **reference vs asset:** read to understand → `reference/`; copied into output or consumed by a script → `assets/`
- **Short:** a skill is loaded into context when used. Cut anything that does not change what the agent does; keep a reference file out of the body when it is only needed in some branches

## Checklist

- [ ] Frontmatter has `name`, `version`, `description`; the name matches the folder
- [ ] All five body sections are present
- [ ] Inputs and outputs are explicit, with no hidden assumptions
- [ ] Deterministic logic is in `scripts/`; reference and asset files are in the right folders
- [ ] Every mention of another skill is a real one and declared in `requires_skills` where needed (`aif validate` checks this)
