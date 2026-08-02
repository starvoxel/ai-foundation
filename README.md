# AI Foundation

A portable, harness-agnostic framework for AI-assisted software development.
Defines agent roles, reusable procedures, enforced rules, and coding standards
as plain files that any AI harness can load.

Works with Kiro, Copilot, Claude Code, or any tool that can inject text into
an agent's context.

---

## Goal

Provide a single source of truth for AI-assisted development workflows that
isn't locked to any vendor. Define once, install anywhere.

---

## Structure

```
ai-foundation/
├── agents/          Agent definitions (.yaml)
├── skills/          Reusable procedures (folders with SKILL.md)
├── steering/        Always-on rules (global/ + {domain}/)
├── standards/       Prescriptive coding/stack rules
├── servers/         MCP tool server definitions
├── bundles/         Install bundles (per-harness deployment)
├── projects/        Per-project overrides
├── docs/            Decision records
├── bin/             CLI entry point (aif)
├── lib/             CLI modules
└── tests/           unit/, integration/, validation/
```

For details on how each component type works, field requirements, and loading
rules, see [`AGENTS.md`](AGENTS.md). Work within this repo is recommended to
be agent-authored using the authoring skills (`skill/agent-authoring`,
`skill/skill-authoring`, etc.).

---

## Installation

Install components to a harness using the `aif` CLI:

```bash
aif install --bundle engineering --harness kiro
aif uninstall --bundle engineering --harness kiro
aif status
aif list bundles
```

Installs are copies (transformed where needed), tracked by a manifest for
clean uninstall and update detection.

| Harness | Status |
|---|---|
| Kiro | Supported |
| Copilot | Planned |
| Claude Code | Planned |

---

## Testing

```bash
node --test "tests/unit/**/*.test.js"          # Fast, no I/O
node --test "tests/integration/**/*.test.js"   # Filesystem tests
node --test "tests/validation/**/*.test.js"    # Real repo checks
```

Requires Node.js 20+. Install dependencies: `npm install`.

---

## Contributing

This repo is framework only — no application code lives here. When adding or
modifying components, use the corresponding authoring skill for the guided
procedure and validation checklist. See `AGENTS.md` for the full specification.
