# Project Standards Template

> Copy this file to `projects/{ProjectName}/project-standards.md` and fill it in.

This file defines overrides and additions specific to one project.
It is composed on top of the universal schema and the language standards file.

---

## Project Identity

| Field          | Value                                    |
|----------------|------------------------------------------|
| Project Name   | {ProjectName}                            |
| Company / Namespace | {Company}                           |
| Root Namespace | {Company}.{ProjectName}                  |
| Language       | {e.g. C#, TypeScript}                   |
| Repository     | {Git URL or local path}                  |
| Created        | {YYYY-MM-DD}                             |

Standards for this project are configured in `.aiconfig.json` under the `standards` field.

---

## Project-Specific Naming Conventions

Only list overrides or additions to the base standards file.
If the base standards file already covers it, do not repeat it here.

| Construct       | Convention  | Example | Reason for Override |
|-----------------|-------------|---------|---------------------|
| {construct}     | {rule}      | {ex}    | {why different}     |

---

## Project-Specific Folder Structure Additions

Only document additions or deviations from the base standards layout.

```
{ProjectName}/
└── {AdditionalFolder}/    ← Purpose: {why this exists}
```

---

## Project-Specific Dependencies

List the NuGet packages (or equivalents) approved for this project.
The Coder agent must not add packages not listed here without a plan update.

| Package                      | Version  | Purpose                        |
|------------------------------|----------|--------------------------------|
| {PackageName}                | {x.y.z}  | {What it is used for}          |

---

## Project-Specific Security Rules

Add rules specific to this project's data sensitivity, user base, or domain.
These add to the universal and language-level security rules — they do not replace them.

- [ ] {Rule specific to this project}

---

## Project-Specific Logging Rules

| Event              | Level  | What is logged    | What is NOT logged |
|--------------------|--------|-------------------|--------------------|
| {project event}    | {level}| {safe fields}     | {excluded fields}  |

---

## Project-Specific Testing Rules

Any additions to the base testing standards — e.g. required integration test scenarios,
specific data fixtures, or environment setup requirements.

---

## Known Constraints & Decisions

Technical decisions and constraints are stored in `knowledge/decisions/`.
Use the decision-record skill to create them.

---

## Out of Bounds

Explicit list of things that must never appear in this project's plans or code,
regardless of what any agent reasons.

- {e.g. No external network calls without explicit plan approval}
- {e.g. No third-party analytics or telemetry}
- {e.g. No cloud storage of user data in v1}
