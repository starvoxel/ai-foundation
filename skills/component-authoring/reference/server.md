# Authoring a server definition

A server exposes tools agents call through a protocol (MCP, HTTP). Folder: `servers/{name}/`; schema and field docs in `server-schema.yaml`.

## Choose: self-hosted or vendor-hosted

- **`hosted: "self"`** (default) — we implement and run it
- **`hosted: "vendor"`** — a third party runs it (for example a product's official remote MCP endpoint). Create only `servers/{name}/{name}.yaml` with `transport: "http"` and a literal `url`; no code, `package.json`, or tests. Source each tool's `name`, `inputs`, and `outputs` from a live `listTools()` call, not vendor prose, and note per tool whether it was confirmed live. Keep the vendor's tool names as registered. Put auth in `headers` as a `${ENV_VAR_NAME}` placeholder, never a literal secret. Skip to the checklist

## Self-hosted layout

```
servers/{name}/
├── {name}.yaml            ← Definition: tools, inputs, outputs
├── index.js               ← Protocol entry point: registers tools, connects the transport
├── logic.js               ← Pure business logic; one exported function per tool; no protocol code
├── package.json           ← Runtime dependencies for standalone install only
└── tests/
    ├── unit/{name}.test.js              ← Pure logic, no I/O
    └── integration/
        ├── {name}.test.js               ← I/O layer against real temp files
        └── {name}.mcp.test.js           ← MCP layer over an in-memory transport (MCP servers)
```

## Rules

- Every tool documents `name` (agents reference it as `@server/tool_name`), `description` (when to use it), every input with type and description (optional ones marked `[optional]`), and `outputs`. Self-hosted tool names are kebab-case
- `index.js` stays a thin wrapper: import from `logic.js`, register each tool with the SDK, connect the transport
- `package.json`: `private`, `"type": "module"`, `engines.node >=22.0.0`, only runtime dependencies. Pin `@modelcontextprotocol/sdk`; zod comes with it
- MCP servers use `@modelcontextprotocol/sdk`: `McpServer` with `registerTool(name, { description, inputSchema }, handler)` and `StdioServerTransport`, with errors logged to stderr
- Tests use `node:test` with `describe('unit: …')`, `describe('integration: …')`, `describe('mcp: …')`. MCP tests connect a `Client` to the server over `InMemoryTransport.createLinkedPair()` and must cover tool listing, a valid invocation, and error handling. Tool listing and connection tests are never skipped; tests needing unavailable infrastructure are skipped with a stated reason
- A definition-only server is acceptable while planning (`version: "0.x.y"`); implementation is required before it can be installed

## Checklist

- [ ] YAML has `name`, `version`, `protocol`, `transport`, `description`, `tools`; the name matches the folder
- [ ] Every tool has `name`, `description`, `inputs`, `outputs`; no literal secrets in `headers`
- [ ] Self-hosted: `logic.js` has no protocol imports, `index.js` is thin, the three test files exist
- [ ] Vendor-hosted: only the YAML exists and `url` is a literal
- [ ] `aif validate` passes
