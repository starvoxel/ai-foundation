# Knowledge System + Standards Resolution — Implementation Plan

> Status: Approved for implementation
> Created: 2026-08-07

---

## Overview

Add a knowledge layer and standards resolution system to ai-foundation that gives
agents structured, discoverable reference material and domain-appropriate standards
for the projects they work on.

---

## Design Decisions

### Standards Resolution

Any agent can reference a standard by name. Resolution order:
1. Project-local: `./standards/{name}.md`
2. Global installed: `{harness_standards_path}/{name}.md`

First match wins. Project-local overrides global.

### Standards Loading via `.aiconfig.json`

Standards are mapped by domain so agents only load what's relevant:

```json
{
  "standards": {
    "engineering": ["csharp-avalonia", "api-design"],
    "product": ["ux-design", "avalonia-components"],
    "all": ["customer-release-notes"]
  }
}
```

- Agents match by their `domain` field from the agent YAML
- `"all"` is the catch-all loaded by every agent regardless of domain
- Individual agents can reference additional standards by name in their prompts

### Knowledge Files

- Location: project-local at `knowledge/` (configurable via `.aiconfig.json`)
- ADRs (Decision Records) live at `knowledge/decisions/` — `status` field gates authority
- Knowledge index (`knowledge/index.json`) provides discoverability without reading all files

### What Lives Where

| Content | Location | Why |
|---|---|---|
| Language/domain golden rules | `standards/{name}.md` (in aif, installed to harness) | Universal, shared across projects |
| Project overrides | `{project}/standards/{name}.md` | Project-specific, trumps global |
| Project defaults | `.aiconfig.json` `standards` map | Tells agents which standards apply |
| API docs, schemas, business rules | `{project}/knowledge/` | Project-specific reference |
| Confirmed decisions | `{project}/knowledge/decisions/` | Settled truth that constrains work |
| Draft decisions | `{project}/knowledge/decisions/` | Same location, `status: Draft` gates usage |
| Epic/chunk plans | `{project}/plans/` | Transient work artifacts |
| Orchestration state | `{project}/plans/orchestration/` | Runtime state, not reference |

---

## Tasks

### 1. Standards resolution steering (global)

- Create `steering/global/standards-loading.md`
- Resolution order: project-local `./standards/{name}.md` → installed global `{harness_path}/{name}.md`
- `.aiconfig.json` `standards` map by domain = defaults loaded per-agent
- Agents can reference additional standards by name in their prompts
- Adapter injects the harness-specific path at install time (`{{standards_path}}` replacement)

### 2. Install standards to harness

- Add `installStandards` to the adapter (copies `standards/*.md` to harness location)
- Kiro: `~/.kiro/standards/`
- Claude: `.claude/standards/`
- Resolver discovers standards files (scan `standards/*.md`, exclude `_template`, `README`)
- All standards installed regardless of bundle (they're small, loading is gated by resolution rules)

### 3. Update `.aiconfig.json` schema

- Change `standards` from string to `Record<string, string[]>` (domain → names map)
- Add `paths.knowledge` (default: `knowledge`)
- Change `paths.decisions` default to `knowledge/decisions`
- Update AGENTS.md, project template, and existing skills that reference these paths

### 4. Define knowledge file format and conventions

- Frontmatter: `name`, `type`, `tags`, `scope`, `description`
- Types: `decision`, `reference`, `architecture`, `api`, `business-rule`
- `scope`: `all` or comma-separated agent/domain names
- `tags`: for relevance matching when agents search the index

### 5. Relocate ADRs into knowledge

- Update decision-record skill output path to `{paths.decisions}` (now `knowledge/decisions/`)
- Update agent prompts/steering that reference ADR locations
- Existing ADR format unchanged — `status` field gates authority

### 6. Create knowledge-authoring skill

- Procedure for creating knowledge entries
- When to create knowledge vs standards vs project-standards
- Validation checklist

### 7. Implement knowledge index generation

- Command: `aif knowledge index` or integrate into `aif snapshot`
- Scans `{paths.knowledge}/**/*.md`, reads frontmatter
- Writes `knowledge/index.json` with metadata per entry
- Agents read the index to discover relevant knowledge without loading everything

### 8. Add agent guidance steering for knowledge consumption

- Global steering: "Before starting work, check knowledge/index.json for relevant entries by tags/scope. Load matching entries."
- Resolution: agents filter by their domain/name in `scope` or by task-relevant `tags`

### 9. Update project template

- `projects/_template/` gets `knowledge/` directory with `decisions/` subdirectory
- Template `.aiconfig.json` updated with new paths and domain-mapped `standards`
- Example knowledge file included

### 10. Tests

- Standards installation (both harnesses)
- Standards path injection in steering transform
- Knowledge index generation (unit + integration)
- `.aiconfig.json` schema validation with new fields
- Resolution priority (project-local trumps global)

---

## Open Questions

- Should `aif knowledge index` be a standalone command or part of `aif snapshot`?
- Should installed standards be tracked in the manifest for status/freshness?
- Do we need a `knowledge/` equivalent installed at the harness level for cross-project knowledge, or is that always project-local?
