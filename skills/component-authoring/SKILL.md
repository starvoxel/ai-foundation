---
name: 'component-authoring'
version: '1.0.2'
description: "Creates or changes an AI component — an agent, skill, steering file, server definition, or bundle — following that type's schema and checklist, and validates it with aif validate."
---

## Purpose

One procedure for authoring every component type this framework installs. It routes to a short reference per type so only the relevant schema and checklist are read. Used when working on the framework itself or on a project's own components.

## Inputs

- **Component type** — agent, skill, steering, server, or bundle
- **What it should do** — in a sentence, plus any constraints (domain, scope, tools)
- **Existing component**, when changing one

## Steps

### Step 1 — Read the reference for the type

| Type     | Reference               | Schema file                                         |
| -------- | ----------------------- | --------------------------------------------------- |
| agent    | `reference/agent.md`    | `reference/agent-tools.yaml` (canonical tool names) |
| skill    | `reference/skill.md`    | —                                                   |
| steering | `reference/steering.md` | `reference/steering-schema.yaml`                    |
| server   | `reference/server.md`   | `reference/server-schema.yaml`                      |
| bundle   | `reference/bundle.md`   | `reference/bundle-schema.yaml`                      |

### Step 2 — Write the component

Follow the reference's structure and rules. Two rules hold for every type:

- Cite, don't restate: when another skill, agent, or steering file owns a definition or procedure, point to it by name — `steering/ai-engineering/citation-rules.md`: "Cite, Don't Restate"
- Keep it short. Every sentence in a prompt, skill, or rule must change what the reader does; cut hedging, restated context, and examples that prevent no specific misunderstanding

### Step 3 — Validate

Run `aif validate` (schema, cross-references, bundle resolution) and `aif snapshot` if a bundle, server, or hook source changed. Do not hand-check what the tooling checks. Then go through the type's checklist in its reference and bump the component's `version`.

## Outputs

- The component file(s) at the location the reference gives, passing `aif validate`

## Edge Cases

- **A type's rules conflict with what was asked** — raise it; do not deviate from the schema without approval
- **The component needs another component that does not exist yet** — author the dependency first, then reference it
- **Unsure which type fits** — a procedure is a skill, an always-on constraint is steering, a persona with tools is an agent
