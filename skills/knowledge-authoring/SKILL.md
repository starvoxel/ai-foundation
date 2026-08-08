---
name: "knowledge-authoring"
version: "0.1.0"
description: "Creates a well-formed knowledge entry with proper frontmatter and placement."
---

## Purpose

Creates a new knowledge entry in a project's `knowledge/` directory. Knowledge entries
provide reference material that agents load when working on related tasks — API schemas,
architecture docs, business rules, and confirmed decisions.

Use this skill when capturing information that agents will need repeatedly across
multiple tasks or sessions.

---

## Inputs

- **Subject** — what this knowledge entry documents
- **Type** — one of: `decision`, `reference`, `architecture`, `api`, `business-rule`
- **Scope** — who needs this: `all`, a domain name, or specific agent names
- **Content** — the actual reference material

---

## Steps

### Step 1 — Determine if this belongs in knowledge

Knowledge is the right place when:
- Multiple agents or sessions will reference this information
- The information is stable (not changing every sprint)
- It describes *what is* or *what was decided*, not *what to do next*

**Not knowledge — use these instead:**
- Prescriptive rules that must always be followed → `standards/` or `project-standards.md`
- A plan for future work → `plans/`
- A one-time instruction → agent prompt or task description

### Step 2 — Choose the type

| Type | Use when... |
|---|---|
| `decision` | Recording a technical decision with options and rationale (use decision-record skill instead) |
| `reference` | General reference: patterns, conventions, prior art, onboarding context |
| `architecture` | System structure: components, relationships, data flow, deployment |
| `api` | Endpoint docs, schemas, request/response formats, auth patterns |
| `business-rule` | Domain logic, validation rules, business constraints, compliance requirements |

### Step 3 — Write the knowledge file

**Location:** `{paths.knowledge}/{name}.md` (from `.aiconfig.json`, default: `knowledge/`)

**Frontmatter:**
```yaml
---
name: "{kebab-case-name}"
type: "{type}"
tags: ["{tag1}", "{tag2}"]
scope: "{all | domain | agent-name}"
description: "{One sentence — agents read this to decide whether to load the file}"
---
```

**Body:** Standard markdown. Prefer:
- Scannable structure (headers, tables, bullet lists)
- Concrete examples over abstract descriptions
- Concise content — agents have context limits

### Step 4 — Choose scope

- `all` — every agent benefits from this (architecture overviews, business rules)
- Domain name (e.g. `engineering`) — only relevant to agents in that domain
- Agent name (e.g. `software-engineer`) — only this agent needs it
- Comma-separated (e.g. `software-engineer, test-engineer`) — multiple specific agents

When in doubt, start with `all`. Narrow later if it's consuming context unnecessarily.

### Step 5 — Choose tags

Tags enable agents to find relevant knowledge by topic. Use:
- The component or service name (`user-service`, `auth`)
- The domain concept (`payments`, `notifications`)
- The technology (`postgres`, `redis`, `graphql`)

3-5 tags is typical. Don't over-tag.

### Step 6 — Self-validate

- [ ] File is in `{paths.knowledge}/` (or `{paths.knowledge}/decisions/` for decisions)
- [ ] Frontmatter has all required fields: `name`, `type`, `tags`, `description`
- [ ] `name` is kebab-case and matches the filename (without `.md`)
- [ ] `type` is one of: `decision`, `reference`, `architecture`, `api`, `business-rule`
- [ ] `tags` is a non-empty array
- [ ] `description` is one sentence, informative enough to decide relevance without reading the body
- [ ] `scope` is `all`, a valid domain, or valid agent name(s)
- [ ] Body is well-structured markdown
- [ ] Content is stable reference material, not transient planning

---

## Outputs

- **Knowledge file** at `{paths.knowledge}/{name}.md`
- **Updated index** — if `knowledge/index.json` exists, it should be regenerated

---

## Edge Cases

- **Content is too large for context** — split into multiple focused knowledge files rather than one large one. Use tags to keep them discoverable together.
- **Content overlaps with standards** — if it's prescriptive ("you must do X"), it belongs in standards. If it's descriptive ("here's how X works"), it's knowledge.
- **Content will change frequently** — consider whether it belongs in knowledge at all. Rapidly changing information may be better served by having the agent read the source directly.
- **Decision Record** — use the `decision-record` skill instead. It produces a knowledge file with the correct decision format and template.
