---
status: accepted
date: 2026-09-25
decision-makers: [Jeremy]
tags: [testing, node-test]
links:
  supersedes: []
affects:
  - package.json
  - tests/**
---

# `node:test` Over Jest/Vitest/Mocha

## Context and Problem Statement

This repo's entire test suite (unit, integration, validation, per-server MCP-protocol
tests) runs on Node's built-in `node:test` module. Neither `jest`, `vitest`, nor
`mocha` appears anywhere in `package-lock.json` — the less common choice among
Node projects, and one no record explains.

## Decision Drivers

- Zero additional runtime dependency for something Node already ships
- No config file, transform pipeline, or plugin ecosystem to maintain
- Must support `describe`/`it`, async tests, and a machine-parseable reporter for CI

## Considered Options

- `node:test` (Node's built-in test runner)
- Jest
- Vitest or Mocha

## Decision Outcome

Chosen: `node:test`, invoked via `node --test "**/*.test.js" --test-reporter spec`
in `package.json`'s `test` script. It ships with the Node version this repo already
requires (`engines.node >= 22`), needs no config file, and its
`describe`/`it`/`assert` API already covers everything this repo's suites use.
Adding Jest/Vitest/Mocha would mean a new dependency, a config file, and a
transform/plugin layer to solve a problem `node:test` already solves natively,
consistent with `0006-plain-js-with-jsdoc.md`'s zero-build-step preference.

## Consequences

- No snapshot testing, no built-in mocking library — tests that need doubles write
  them by hand or restructure the code under test to avoid needing one (matches
  `steering/engineering/core.md`'s testability rule: separate pure logic from I/O).
- No parallel-by-default test isolation the way Jest provides — this repo's suites
  are fast enough (thousands of tests, single-digit seconds) that this hasn't been a
  problem.
- Smaller plugin/ecosystem surface than Jest/Vitest, but nothing this repo's test
  suites have needed so far.
