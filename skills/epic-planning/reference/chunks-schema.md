# chunks.json Schema

The chunk decomposition for an epic is stored as a `chunks.json` file alongside
the epic plan. This file is the machine-parseable source of truth for the
dependency graph consumed by the DAG server tools (`dag-validate`, `dag-compute-waves`).

Start from the template at `skills/epic-planning/assets/chunks.json`.

---

## Location

```
{paths.chunks}/{EpicID}/chunks.json
```

Resolved from `.aiconfig.json` at project root. Default: `plans/chunks/`.

---

## Fields

### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `epic_id` | string | Yes | Parent epic ID for traceability |
| `chunks` | array | Yes | Array of chunk definitions |

### Chunk object

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique chunk identifier (e.g., "001", "002") |
| `title` | string | Yes | Short descriptive title |
| `depends_on` | string[] | Yes | Array of chunk IDs this chunk depends on. Empty array for no dependencies. |
| `agents` | string[] | Yes | Array of agent roles assigned to this chunk |

---

## Rules

- Every `depends_on` reference must point to an existing chunk `id` in the same file.
- The dependency graph must be acyclic (no circular dependencies).
- Chunk IDs must be unique within the file.
- Run `dag-validate` against the file before marking the epic as decomposed.

---

## Example

```json
{
  "epic_id": "MYAPP-001",
  "chunks": [
    {
      "id": "001",
      "title": "Data models and migrations",
      "depends_on": [],
      "agents": ["Software-Engineer"]
    },
    {
      "id": "002",
      "title": "API service layer",
      "depends_on": [],
      "agents": ["Software-Engineer"]
    },
    {
      "id": "003",
      "title": "Controller and routing",
      "depends_on": ["001", "002"],
      "agents": ["Software-Engineer"]
    },
    {
      "id": "004",
      "title": "Integration tests",
      "depends_on": ["003"],
      "agents": ["Test-Engineer"]
    }
  ]
}
```

This produces two execution waves:
- **Wave 1:** 001, 002 (parallel — no dependencies)
- **Wave 2:** 003 (depends on 001 + 002)
- **Wave 3:** 004 (depends on 003)
