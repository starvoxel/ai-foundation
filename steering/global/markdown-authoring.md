---
name: 'global-markdown-authoring'
version: '0.3.0'
description: 'Prohibits manual hard-wrapping of prose in markdown files; paragraphs must be written as continuous logical lines.'
file_patterns: ['**/*.md']
---

## Scope

All agents, whenever creating or editing a `.md` file.

---

## Rules

### Rule: Do Not Manually Hard-Wrap Prose

- Write each paragraph or list item as one continuous line; only real paragraph, item, or section boundaries get a line break
- Tables, code blocks, frontmatter, and intentional hard breaks follow their own formatting

**Rationale:** Hard-wrapped prose makes a one-word change touch every line of a paragraph and fights reflow.

**Exceptions:** None for prose.

---

## Enforcement

Caught in self-validation or review (MEDIUM formatting finding); reflow the paragraph.
