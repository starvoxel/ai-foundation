# Knowledge File Format

Knowledge files are structured markdown documents with YAML frontmatter that
provide reference material to agents working on a project.

---

## Location

Knowledge files live in the project's knowledge directory (default: `knowledge/`),
configurable via `.aiconfig.json` `paths.knowledge`.

Decision Records are a special type of knowledge file stored at
`{paths.knowledge}/decisions/` (default: `knowledge/decisions/`).

---

## Frontmatter Schema

```yaml
---
name: "api-schema"
type: "reference"
tags: ["api", "rest", "endpoints"]
scope: "software-engineer"
description: "Complete REST API schema with request/response formats."
---
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Kebab-case identifier for this knowledge entry |
| `type` | string | Yes | Category. One of: `decision`, `reference`, `architecture`, `api`, `business-rule` |
| `tags` | string[] | Yes | Keywords for relevance matching when agents search the index |
| `scope` | string | No | Which agents should load this. `all` (default) or comma-separated agent/domain names |
| `description` | string | Yes | One-sentence summary. Agents read this to decide whether to load the full file |

### Types

| Type | When to use |
|---|---|
| `decision` | ADRs — technical decisions with options explored and chosen approach |
| `reference` | General reference material (coding patterns, conventions, prior art) |
| `architecture` | System architecture, component relationships, data flow |
| `api` | API schemas, endpoint documentation, request/response formats |
| `business-rule` | Domain logic rules, validation requirements, business constraints |

### Scope

- `all` — every agent loads this when relevant (default if omitted)
- Domain name (e.g. `engineering`) — only agents in this domain load it
- Agent name (e.g. `software-engineer`) — only this specific agent loads it
- Comma-separated (e.g. `software-engineer, test-engineer`) — multiple specific agents

---

## Body

The body is standard markdown. No restrictions on structure — use whatever format
communicates the information clearly. Prefer concise, scannable content over prose.

---

## Naming Convention

- General knowledge: `{name}.md` (kebab-case)
- Decision Records: `{YYYY-MM-DD}_{###}_{short-title}.decision.md`

---

## Examples

### API Reference

```markdown
---
name: "user-api"
type: "api"
tags: ["api", "users", "authentication"]
scope: "software-engineer"
description: "User service REST API — endpoints, auth, and response formats."
---

## Endpoints

### POST /api/users
Creates a new user account.

**Request:**
...
```

### Architecture

```markdown
---
name: "service-architecture"
type: "architecture"
tags: ["architecture", "services", "deployment"]
scope: "all"
description: "High-level service architecture and component relationships."
---

## Components

- **API Gateway** — routes requests to services
- **User Service** — authentication and user management
...
```

### Decision Record

```markdown
---
name: "auth-approach"
type: "decision"
tags: ["auth", "security", "api"]
scope: "all"
description: "Chose JWT with refresh tokens over session-based auth."
---

# Decision Record: Auth Approach

## Metadata
| Field | Value |
|---|---|
| Status | Confirmed |
| Confirmed By | Jeremy |
...
```
