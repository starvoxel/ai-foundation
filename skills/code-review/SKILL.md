---
name: "code-review"
version: "0.2.0"
description: "Produces a Review Report with severity-classified findings for completed source code."
---

## Purpose

Reviews source code against its Chunk Plan, language standards, and project standards.
Produces a structured report that either approves the code or returns it with actionable findings for correction.

---

## Inputs

- **Source code** — files to review
- **Chunk Plan** — what was supposed to be built (acceptance criteria, security, logging)
- **Language standards** — from `standards/{stack}.md`
- **Project standards** — from `projects/{name}/project-standards.md`

---

## Steps

### Step 1 — Review Completeness

Verify every component in the plan's component list exists. Missing components are CRITICAL findings before any code quality review begins.

### Step 2 — Review Security and Logging

Go through security and logging requirements line by line. Each unmet requirement is a finding classified HIGH or CRITICAL.

### Step 3 — Review Standards Compliance

Check naming conventions, file headers, doc comments, async patterns, error handling, and any other rules in the active standards files.

### Step 4 — Review Logic and Correctness

Does the implementation match the plan's described behaviour? Are edge cases handled?
Are interfaces implemented as specified?

### Step 5 — Produce Review Report

Write the report using the template at `skills/code-review/reference/template.md`.
Classify each finding by severity:

| Severity | Meaning |
|---|---|
| CRITICAL | Security vulnerability, data loss risk, broken builds |
| HIGH | Security/logging requirement unmet, major standards violation, acceptance criterion missed |
| MEDIUM | Standards violation not affecting correctness, missing docs |
| LOW | Style inconsistency, minor naming deviation |

Any CRITICAL or HIGH finding blocks approval.

---

## Outputs

- **Review Report** — markdown following the template format
- **Outcome:** Approved (no CRITICAL/HIGH) or Returned (has CRITICAL/HIGH findings)

---

## Edge Cases

- **No findings at all** — still produce the report with outcome Approved and a brief summary of what was reviewed.
- **Finding interacts with another finding** — note the relationship. Fixing one may resolve or change the other.
- **Standards conflict with plan** — raise as a finding with both references. Do not silently pick one.
