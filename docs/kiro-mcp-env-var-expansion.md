---
name: 'kiro-mcp-env-var-expansion'
tags: ['kiro', 'mcp', 'secrets', 'configuration']
scope: 'all'
description: 'Whether Kiro supports ${VAR} environment-variable expansion in mcp.json, and the approved-env-var allowlist gate that differs from Claude Code.'
---

## Question

Can Kiro's MCP server config (`.kiro/settings/mcp.json` or equivalent
workspace/global scope) hold `${VAR_NAME}` as a literal value in `env`
(stdio) or `headers`/auth (HTTP/SSE) fields, with Kiro itself expanding it
from its own process environment at launch/connect time — so no secret
value is ever written to disk?

## Answer

**Supported: yes.** Kiro's official docs confirm environment-variable
expansion in `mcp.json`, using `${VARIABLE_NAME}` — the same placeholder
style as Claude Code's `.mcp.json`.

**Fields/transports:**

- **Local (stdio) servers** — the `env` object. Docs example:
  `"env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }`.
- **Remote servers** — both `env` and `headers`, e.g.
  `"Authorization": "Bearer ${API_TOKEN}"`. Confirms Kiro supports an
  HTTP/SSE-style remote transport with header-based auth, and expansion
  applies there too.
- `url`, `args`, `command` are not covered by the documented examples —
  treat as unconfirmed, not "no."

**Key difference from Claude Code — an approval gate:** Kiro only expands
variables on an explicit **approved list** ("Mcp Approved Env Vars" in
Kiro settings). An unapproved `${VAR}` triggers a security popup and is
not expanded until approved. Writing `${VAR}` into Kiro's config does not
"just work" the way it does in Claude Code — the variable name also needs
prior (likely manual, per-machine, one-time) approval in Kiro settings.

**Caveat found in the wild:** several open `kirodotdev/Kiro` GitHub issues
report expansion breaking in specific contexts (kiro-cli vs. IDE
diverging; failing when the config key name differs from the referenced
variable name). These are bug reports, not documentation — reason to
verify manually against the target Kiro version rather than trust the
docs alone for edge cases.

**Confidence:** High for the core claim (stated directly in Kiro's own
docs). Medium for full field/transport coverage and real-world
reliability, given the open bug reports.

## Sources

- Kiro Docs — MCP Configuration: https://kiro.dev/docs/mcp/configuration/
- Kiro Docs — MCP Security best practices: https://kiro.dev/docs/mcp/security/
- GitHub kirodotdev/Kiro#5060 — "Environment variable substitution does not work for mcp.json"
- GitHub kirodotdev/Kiro#5988 — "kiro-cli does not interpolate environment variables in mcp.json config"
- GitHub kirodotdev/Kiro#7517 — "MCP env config fails to resolve ${VAR} when env var name differs from the config key name"
- GitHub kirodotdev/Kiro#6635 — "Feature Request: Support environment variable expansion in mcp.json" (older/duplicate-looking; feature may have shipped after filing — timeline not verified)
