---
name: 'test-execution'
version: '1.0.0'
description: 'Writes and runs automated tests for a change against its request or plan, in unit/integration/validation layers, and reports pass/fail/blocked without ever weakening a test to get green.'
---

## Purpose

Verifies an implementation against its request or approved plan with tests that are fast, focused, and honest. Applies the testable-by-design rule in `steering/engineering/core.md`.

## Inputs

- **Request and plan** — the acceptance criteria and error states to cover
- **Source code** — the implementation under test
- **Standards** — testing conventions and the run commands from `standards/{stack}.md` and the project's own standards file

## Steps

### Step 1 — Plan the coverage

List what each acceptance criterion and error state needs. Separate pure logic (unit-testable with plain data) from behavior that needs I/O (integration). If a module mixes the two, test it as it is and raise extracting the pure logic as a finding.

### Step 2 — Write the tests

Use the existing layout, creating only what is missing:

- `tests/unit/` — no filesystem, network, or processes; data in, data out
- `tests/integration/` — real I/O: temp directories, subprocesses
- `tests/validation/` — the real repo or environment is well-formed
- `tests/helpers/` — shared, composable fixtures; add setup there, not inline

Each test covers one behavior or boundary, is named for what the system does rather than how, and does not duplicate another test. Every public function gets a happy path and a failure or edge case.

### Step 3 — Run everything

Run the full suite with the commands in the standards, without stopping at the first failure. Never edit source just to make a test pass. If a test exposes a defect, fix the defect; if the test is wrong, fix the test and say why. Never skip or weaken a test to get green.

### Step 4 — Report

State the outcome and counts (passed, failed, blocked). For each failure give the assertion versus what happened and the likely cause (code bug, test bug, or unclear requirement). For each blocked case say why it could not be written or run and what is needed. Never skip a case silently.

## Outputs

- Tests in the right layer, plus any new shared fixtures
- A short pass/fail/blocked report in the summary or PR description

## Edge Cases

- **A test cannot pass without a source change** — mark it Failed and decide whether it is a code bug, test bug, or unclear requirement
- **Infrastructure the test needs is unavailable** — mark it Blocked and say what is needed
- **Two planned cases verify the same behavior** — implement one and note the overlap
