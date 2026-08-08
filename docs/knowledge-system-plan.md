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

### 1. Standards resolution steering (global) ✅

- Created `steering/global/standards-loading.md`
- Resolution order: project-local `./standards/{name}.md` → installed global `{harness_path}/{name}.md`
- `.aiconfig.json` `standards` map by domain = defaults loaded per-agent
- Agents can reference additional standards by name in their prompts
- Adapter injects the harness-specific path at install time (`{{standards_path}}` replacement)

### 2. Install standards to harness ✅

- Added `installStandards` to the base adapter (copies `standards/*.md` to harness location)
- Kiro: `~/.kiro/standards/`
- Claude: `.claude/standards/`
- `listStandards` in resolver discovers files (excludes `_template`, `README`)
- All standards installed regardless of bundle (loading gated by resolution rules)

### 3. Update `.aiconfig.json` schema ✅

- Changed `standards` from string to `Record<string, string[]>` (domain → names map)
- Added `paths.knowledge` (default: `knowledge`)
- Changed `paths.decisions` default to `knowledge/decisions`
- Updated AGENTS.md and project template

### 4. Define knowledge file format and conventions ✅

- Created `docs/knowledge-file-format.md` — full format spec
- Frontmatter: `name`, `type`, `tags`, `scope`, `description`
- Types: `decision`, `reference`, `architecture`, `api`, `business-rule`
- Added `projects/_template/knowledge/` with example file and `decisions/` subdirectory

### 5. Relocate ADRs into knowledge ✅

- Updated decision-record skill output path default to `knowledge/decisions/`
- Agent prompts already reference decisions conceptually (no path changes needed)
- `status` field continues to gate authority (Confirmed vs Draft)

### 6. Create knowledge-authoring skill ✅

- Created `skills/knowledge-authoring/SKILL.md`
- Covers: when to use knowledge, type selection, frontmatter writing, scope/tags guidance
- Self-validation checklist included

### 7. Implement knowledge index generation 🔲

- Command: `aif knowledge index` or integrate into `aif snapshot`
- Scans `{paths.knowledge}/**/*.md`, reads frontmatter
- Writes `knowledge/index.json` with metadata per entry
- Agents read the index to discover relevant knowledge without loading everything

### 8. Add agent guidance steering for knowledge consumption 🔲

- Global steering: "Before starting work, check knowledge/index.json for relevant entries by tags/scope. Load matching entries."
- Resolution: agents filter by their domain/name in `scope` or by task-relevant `tags`

### 9. Update project template 🔲

- Already partially done (knowledge/ directory exists in template)
- Remaining: add guidance comments, ensure template .aiconfig.json is complete

### 10. Tests 🔲

- Standards installation tests ✅ (done in task 1-3)
- Knowledge index generation tests (pending task 7)
- Resolution priority tests (pending)

---

## Open Questions

- Should `aif knowledge index` be a standalone command or part of `aif snapshot`?
- Should installed standards be tracked in the manifest for status/freshness?
- Do we need a `knowledge/` equivalent installed at the harness level for cross-project knowledge, or is that always project-local?
