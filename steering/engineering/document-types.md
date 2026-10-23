---
name: 'document-types'
version: '0.5.0'
description: 'Routes any new non-code document to the one home its kind owns.'
file_patterns: []
---

## Scope

All agents with `domain = "engineering"`.

---

## Rules

### Rule: Each Kind of Document Has One Home

Before writing a non-code document, identify its kind and use that home; never create a second file that duplicates it.

| Kind                    | Answers                            | Home                                         | Owner                                                                 |
| ----------------------- | ---------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| **Architecture doc**    | How the system currently works     | `{paths.architecture}/*`, as arc42 sections  | The main engineering agent, at implementation time                    |
| **Product doc**         | What a product area does, for whom | `{paths.product}/*`                          | The main engineering agent, via `skill/prd`<!-- skill-ref: ignore --> |
| **Process & ownership** | How we work, who is accountable    | `steering/`, `standards/`, agent definitions | The human, with the main engineering agent                            |
| **External reference**  | How an outside system behaves      | `{paths.knowledge}/{name}.md` (flat)         | Whoever needs it                                                      |

An API or a business rule is subject matter, not a kind: it lives in the code (a `key_files` entry), the arc42 section covering it, or `standards/`. Never create a standalone file for either.

**Rationale:** The kind of a document, not its subject, decides where it lives, so "where does this go" has one answer.

**Exceptions:** If you truly cannot find a home, ask.

### Rule: External Reference Files Have a Fixed Shape

A `{paths.knowledge}/{name}.md` file about an outside system (a third-party API's real behavior, a vendor's constraints) opens with:

```yaml
---
name: '{kebab-case-name}'
tags: ['{tag1}', '{tag2}']
scope: '{all | domain | agent-name}'
description: '{One sentence — agents read this to decide whether to load the file}'
---
```

Keep the body scannable and concise. Start with `scope: all` and narrow later if it costs context.

**Rationale:** The one-line description lets an agent decide whether to load the file.

**Exceptions:** None.

---

## Enforcement

A document outside its kind's home is MEDIUM; a malformed external-reference file is LOW.
