---
name: 'citation-rules'
version: '1.0.0'
description: 'How agents, skills, and steering cite each other: cite instead of restating, and cite by name rather than by number. Loaded for projects that author AI components.'
file_patterns: []
---

## Scope

Anyone authoring or editing an agent, skill, or steering file.

---

## Rules

### Rule: Cite, Don't Restate

- When a definition, procedure, or table is owned by another skill, agent, or steering file, cite it by name and never copy its content. Citing and also restating is still a violation
- The same applies inside one document: when one section owns a definition or list, other sections point to it
- In an agent's prompt, Hard rules is the one place for enumerated never/always constraints. Narrative sections may describe a boundary in prose but must not repeat the itemized list; point to Hard rules
- Default to citing. "It reads better inline" is not a reason to restate

**Rationale:** Copies drift apart, and every restated paragraph is context an agent pays for again.

**Exceptions:** A short illustrative example. Same-document back-references to a rule in the same file need no locator.

### Rule: Cite a Locator by Name, Never by Number

- To cite one part of a component, name it: `` `skill/{name}`: "Step Heading Text" `` or `` `steering/{path}.md`: "Rule Heading Text" ``, chaining with `→` for more than one. A whole-component reference (`skill/{name}`) needs no quoted name
- Skill steps stay numbered (`### Step N — Name`) because order matters, and the citation still names the step. Steering rules are headed `### Rule: Name` with no number at all, so a bare `Rule 10` cannot silently point at the wrong rule after a reorder

**Rationale:** A number keeps resolving to something even after it has been reordered or replaced; a name fails loudly.

**Exceptions:** Tutorial docs outside skills, agents, and steering (a server's setup README) may number their own steps.

---

## Enforcement

`aif validate refs` fails the build on a bare-component reference paired with a raw `Step N` or `Rule N` mention, and on a quoted locator that no longer matches a heading in the cited component. Restating cited content is a MEDIUM finding at review.
