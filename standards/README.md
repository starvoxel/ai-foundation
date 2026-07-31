# Standards

> **This file is for human reference only. Agents must not load this file.**

Standards files define prescriptive rules for a language, stack, or methodology.
Deviation requires an explicit exception noted in the plan.

## Adding a new standards file

1. Create `{stack-name}.md` in this directory
2. Add YAML front-matter (`name`, `version`, `description`)
3. Define rules agents must follow when working in that stack

## What belongs here

- Language conventions (naming, patterns, file structure)
- Framework-specific rules (MVVM, async patterns, error handling)
- Testing framework and library choices
- Logging format and requirements
- Security baseline for the stack

## What doesn't belong here

- Project-specific overrides (go in `projects/{name}/project-standards.md`)
- Universal rules not tied to a stack (go in `steering/`)
- General knowledge or reference material (go in `knowledge/`)
