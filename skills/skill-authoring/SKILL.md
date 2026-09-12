---
name: 'skill-authoring'
version: '0.1.1'
description: 'Creates a well-formed, self-contained skill with proper folder structure and documentation.'
---

## Purpose

Creates a new skill in the `skills/` directory. A skill is a reusable, self-contained procedure — it defines inputs, steps, and outputs. Skills have no identity, no domain, and no hard rules. An agent invokes a skill when a task requires that procedure.

Use this skill when you need to author a new skill from scratch or restructure an existing one to meet the framework's requirements.

---

## Inputs

- **Skill name** — kebab-case identifier (becomes the folder name)
- **What it produces** — the output artifact or outcome
- **Who invokes it** — which agents will declare it in their `skills` field
- **Whether it needs reference material, assets, or scripts**

---

## Steps

### Step 1 — Create folder structure

Create the folder `skills/{name}/`. The structure is:

```
skills/{name}/
├── SKILL.md              ← The procedure definition (entry point)
├── reference/            ← Material the agent reads DURING skill execution
├── assets/               ← Files used in the skill's OUTPUT or by scripts
└── scripts/              ← Executable scripts for deterministic operations
```

**Folder purposes:**

| Folder       | Contents                                    | Used by                       | Example                                         |
| ------------ | ------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| `reference/` | Schemas, templates, examples, style guides  | The agent, during execution   | `reference/schema.md` — field definitions       |
| `assets/`    | Output templates, boilerplate files, images | Scripts or copied into output | `assets/template.yaml` — file the skill outputs |
| `scripts/`   | Validation, transforms, generators, checks  | The agent via `shell` tool    | `scripts/validate.js` — schema validator        |

### Step 2 — Write SKILL.md frontmatter

Use the schema documented in `skills/skill-authoring/reference/schema.md`:

```yaml
---
name: 'skill-name'
version: '0.1.0'
description: 'One sentence describing what this skill produces.'
---
```

### Step 3 — Write the five required body sections

Every SKILL.md must have these sections in order:

1. **Purpose** — What it does, when to use it, what problem it solves
2. **Inputs** — What information the skill needs (explicit, no hidden assumptions)
3. **Steps** — The ordered procedure (numbered sub-steps with clear actions)
4. **Outputs** — What the skill produces and where it goes
5. **Edge Cases** — How to handle failures, ambiguity, or unusual situations

### Step 4 — Add reference material (if needed)

Place files in `reference/` that the agent needs to read during execution:

- Schema definitions
- Format specifications
- Examples of good output
- Decision criteria

Reference files are **read by the agent** to inform its work.

### Step 5 — Add assets (if needed)

Place files in `assets/` that are used in the output or by scripts:

- Output templates that get copied/filled
- Boilerplate files
- Static resources included in deliverables

Assets are **used in production of output**, not read for understanding.

### Step 6 — Add scripts for deterministic work

**Every operation that is deterministic and repeatable MUST be a script, not prose instructions for the agent.** The agent invokes scripts via the `shell` tool. AI reasoning is expensive and unreliable for mechanical tasks.

Scripts go in `scripts/`. Examples:

- Schema validation (`scripts/validate.js`)
- File generation from templates (`scripts/generate.js`)
- Cross-reference checks (`scripts/check-refs.js`)
- Format transforms (`scripts/transform.js`)

**Rule:** If a step can be expressed as "run this command and check the exit code," it MUST be a script. Do not ask an agent to manually verify something a script can verify deterministically.

### Step 7 — Self-validate

Verify against the checklist:

- [ ] Frontmatter has `name`, `version`, `description`
- [ ] `name` is kebab-case and matches the folder name
- [ ] `version` is valid semver
- [ ] `description` is one sentence
- [ ] All five body sections are present (Purpose, Inputs, Steps, Outputs, Edge Cases)
- [ ] Skill is self-contained — no references to specific agents or projects
- [ ] Inputs and outputs are explicit — no hidden assumptions
- [ ] Any deterministic logic is in `scripts/`, not prose
- [ ] Reference files are in `reference/`
- [ ] Assets (output templates, boilerplate) are in `assets/`

---

## Outputs

- **`skills/{name}/SKILL.md`** — the procedure definition
- **`skills/{name}/reference/`** — supporting material (if needed)
- **`skills/{name}/assets/`** — output templates and static resources (if needed)
- **`skills/{name}/scripts/`** — executable validation/generation scripts (if needed)

---

## Edge Cases

- **Skill is too broad** — if a skill covers multiple distinct procedures, split it. Each skill should do one thing well.
- **Skill references a specific agent** — skills are agent-agnostic. Remove the reference; the agent's `skills` field declares the relationship.
- **Skill references a specific project** — skills are project-agnostic. Use inputs to accept project-specific information at invocation time.
- **Unclear whether something is reference or asset** — if the agent reads it to understand what to do → `reference/`. If it's copied into output or consumed by a script → `assets/`.
- **Unclear whether to use a script or prose step** — if the operation produces the same result every time given the same inputs, it's deterministic → script. If it requires judgment, interpretation, or creative output → prose step for the agent.
