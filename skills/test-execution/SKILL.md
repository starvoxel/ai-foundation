---
name: "test-execution"
version: "0.1.0"
description: "Produces a Test Results Report with pass/fail/blocked status for each test case."
---

## Purpose

Writes and executes automated tests from the Chunk Plan's Testing Plan section.
Produces a structured report showing pass/fail/blocked status per test case with
failure analysis.

---

## Inputs

- **Chunk Plan** — specifically the Testing Plan section with defined test cases
- **Source code** — approved implementation to test
- **Language standards** — testing conventions from `standards/{stack}.md`
- **Project standards** — test project structure from `projects/{name}/project-standards.md`

---

## Steps

### Step 1 — Read Testing Plan

Understand every test case before writing any tests. Identify shared setup
opportunities to avoid redundant code.

### Step 2 — Set Up Test Structure

Create or verify test project structure per the active standards file.

### Step 3 — Write Test Cases

Write all tests following naming conventions in the active standards file.
Use the mocking library specified in standards for interface dependencies.

### Step 4 — Run All Tests

Execute the full test suite. Do not stop at the first failure.

### Step 5 — Produce Test Results Report

Write the report using the template at `skills/test-execution/reference/template.md`.
Classify each result and provide failure analysis.

---

## Outputs

- **Test files** — written to the test project per standards
- **Test Results Report** — markdown following the template format

---

## Edge Cases

- **Test cannot pass without source code change** — classify as Failed, assess whether it's a code bug, test bug, or plan ambiguity. Recommend action.
- **Test case cannot be implemented as written** — classify as Blocked with explanation. Never silently skip.
- **External dependency required** — if a test needs infrastructure not available, mark Blocked and explain what's needed.
