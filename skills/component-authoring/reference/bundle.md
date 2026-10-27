# Authoring a bundle

A bundle defines which components get installed to a harness. File: `bundles/{name}/bundle.yaml`; schema and the exact resolution algorithm in `bundle-schema.yaml`.

## Rules

- Required fields: `name` (kebab-case, matches the directory), `version`, `description`, and either `domain` or at least one non-empty list (or both). A bundle that resolves to nothing is an error
- **Domain discovery** (`domain: "{name}"`): installs the domain's agents, their skills, the domain's steering, and referenced servers
- **Explicit lists** (`agents`, `skills`, `steering`, `servers`): appended after discovery, deduplicated. Use them to add components discovery does not reach
- A domain with no agents yields only steering; consider explicit lists instead
- A listed component that does not exist is included anyway (for forward references) and fails at install
- Keep bundles small: components not every project needs (for example the authoring skills) belong in their own bundle

## Checklist

- [ ] File at `bundles/{name}/bundle.yaml` with the required fields
- [ ] Every listed agent, skill, steering file, and server exists in the repo
- [ ] `aif validate` passes
