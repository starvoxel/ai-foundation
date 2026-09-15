---
name: 'code-review'
version: '0.3.0'
description: 'Reviews completed source code for completeness, security, standards, and correctness; classifies findings via skill/review-severity.'
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

Hand the findings gathered in Steps 1-4 to `skill/review-severity` for severity classification, ordering, and
the report itself — this skill defines what to check, not how findings are ranked or rendered.

---

## Outputs

- **Review Report** — produced per `skill/review-severity`
- **Outcome:** Approved or Returned, per `skill/review-severity`

---

## Edge Cases

See `skill/review-severity` for severity/reporting edge cases. Code-review-specific:

- **A missing component overlaps a standards violation** — report the missing-component finding (Step 1);
  don't also flag the standards rules it would have needed to follow.
