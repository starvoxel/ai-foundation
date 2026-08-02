---
name: "server-authoring"
version: "0.1.0"
description: "Creates an MCP server definition with tool documentation and integration test."
---

## Purpose

Creates a new server definition in `servers/`. A server exposes tools that agents can
call via MCP (Model Context Protocol). The definition describes what tools exist, their
inputs/outputs, and how to connect.

Use this skill when adding a new tool server to the framework.

---

## Inputs

- **Server name** — kebab-case identifier (becomes the folder name)
- **What tools it exposes** — names, descriptions, parameters
- **Protocol and transport** — typically `mcp` / `stdio`
- **Whether it needs implementation** — definition-only or with running code

---

## Steps

### Step 1 — Create folder structure

Create `servers/{name}/` containing:

```
servers/{name}/
├── {name}.yaml           ← Server definition (required)
├── {name}.test.js        ← Integration test (required)
└── {name}.md             ← Extended docs (optional)
```

### Step 2 — Write the YAML definition

Use the schema in `skills/server-authoring/reference/schema.yaml`.

Every tool must document:
- `name` — what agents reference via `@server/tool_name`
- `description` — when to use it (one or two sentences)
- `inputs` — every parameter with type and description
- `outputs` — what is returned

### Step 3 — Write the integration test

The test must cover:
1. **Startup** — server starts without error
2. **Tool listing** — server reports all tools declared in YAML
3. **Tool invocation** — each tool responds to valid input without error

Use `node:test` with `describe/it` structure. See existing tests for patterns.

### Step 4 — Self-validate

- [ ] Folder is `servers/{name}/`
- [ ] YAML has `name`, `version`, `protocol`, `transport`, `description`, `tools`
- [ ] `name` is kebab-case, matches folder name
- [ ] Every tool has `name`, `description`, `inputs`, `outputs`
- [ ] Input types are specified: `string`, `number`, `boolean`, `array`, `object`
- [ ] Optional inputs are marked `[optional]`
- [ ] Integration test file exists at `servers/{name}/{name}.test.js`
- [ ] Test covers startup, tool listing, and invocation

---

## Outputs

- **`servers/{name}/{name}.yaml`** — server definition
- **`servers/{name}/{name}.test.js`** — integration test
- **`servers/{name}/{name}.md`** (optional) — extended documentation

---

## Edge Cases

- **Server requires external infrastructure** — mark tool invocation tests as skipped with documented reason. Startup and listing tests are never optional.
- **Server not yet implemented** — definition-only is acceptable during development. Set `version: "0.x.y"` to signal it's not yet validated.
- **Tool has complex input schema** — create the optional `.md` companion with examples.
- **Tool name collides with another server** — agents disambiguate via the `@server/tool` format, so same tool names across different servers is fine.
