# Servers

> **This file is for human reference only. Agents must not load this file.**

Server definitions describe tool providers that agents can connect to. Each server
is a folder containing a YAML definition and an integration test.

## Structure

```
servers/{name}/
├── {name}.yaml           ← Server definition (tools, protocol, transport)
└── {name}.test.js        ← Integration test (startup, tool listing, invocation)
```

## Adding a new server

1. Copy `_template/` to `{name}/`
2. Rename `_template.yaml` → `{name}.yaml` and `_template.test.js` → `{name}.test.js`
3. Document every tool with name, description, inputs, and outputs
4. Implement the integration test

## What belongs here

- MCP server definitions
- Integration tests validating server functionality
- Optional `.md` companions for detailed tool documentation

## What doesn't belong here

- Schema validation tests (those live in `tests/schemas.test.js`)
- Application code
- Agent definitions
