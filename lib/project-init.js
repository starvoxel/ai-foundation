/**
 * Pure logic for project initialization.
 * No I/O — generates the file/directory manifest for a new project.
 */

/**
 * Generate the list of files and directories to create for a new project.
 * @param {string} projectName - The project name (used in .aiconfig.json)
 * @returns {{ dirs: string[], files: Array<{ path: string, content: string }> }}
 */
export function generateProjectManifest(projectName) {
  const dirs = [
    'knowledge/decisions',
    'plans/epics',
    'plans/chunks',
    'plans/orchestration',
  ];

  const files = [
    {
      path: '.aiconfig.json',
      content: JSON.stringify({
        project_name: projectName,
        standards: {
          engineering: [],
          all: [],
        },
        project_standards: 'project-standards.md',
        paths: {
          plans: 'plans',
          epics: 'plans/epics',
          chunks: 'plans/chunks',
          decisions: 'knowledge/decisions',
          orchestration: 'plans/orchestration',
          knowledge: 'knowledge',
        },
      }, null, 2) + '\n',
    },
    {
      path: 'project-standards.md',
      content: generateProjectStandards(projectName),
    },
    {
      path: 'knowledge/example.md',
      content: `---
name: "example"
type: "reference"
tags: ["example"]
scope: "all"
description: "Example knowledge file — delete this and replace with real project knowledge."
---

## Example

This is a placeholder. Replace it with actual project knowledge:
- API schemas
- Architecture documentation
- Business rules
- Reference material

See the knowledge-authoring skill for the full format spec.
`,
    },
  ];

  return { dirs, files };
}

/**
 * Generate project-standards.md content.
 * @param {string} projectName
 * @returns {string}
 */
function generateProjectStandards(projectName) {
  return `# Project Standards: ${projectName}

> This file defines overrides and additions specific to this project.
> It is composed on top of the global standards referenced in \`.aiconfig.json\`.

---

## Project Identity

| Field              | Value          |
|--------------------|----------------|
| Project Name       | ${projectName} |
| Language           |                |
| Repository         |                |
| Created            | ${new Date().toISOString().slice(0, 10)} |

Standards for this project are configured in \`.aiconfig.json\` under the \`standards\` field.

---

## Project-Specific Naming Conventions

Only list overrides or additions to the base standards file.

---

## Project-Specific Dependencies

List approved packages. Agents must not add packages not listed here without plan approval.

| Package | Version | Purpose |
|---------|---------|---------|

---

## Project-Specific Security Rules

- [ ] {Rule specific to this project}

---

## Project-Specific Testing Rules

Any additions to the base testing standards.

---

## Known Constraints & Decisions

Technical decisions and constraints are stored in \`knowledge/decisions/\`.
Use the decision-record skill to create them.

---

## Out of Bounds

Explicit list of things that must never appear in this project's plans or code.

- {e.g. No external network calls without explicit plan approval}
`;
}

/**
 * Validate project name for use as a directory name.
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateProjectName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Project name is required' };
  }

  if (name.trim() !== name) {
    return { valid: false, error: 'Project name must not have leading or trailing spaces' };
  }

  if (/[<>:"/\\|?*]/.test(name)) {
    return { valid: false, error: 'Project name contains invalid characters' };
  }

  if (name.startsWith('.') || name.startsWith('_')) {
    return { valid: false, error: 'Project name must not start with . or _' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'Project name must be 100 characters or fewer' };
  }

  return { valid: true };
}
