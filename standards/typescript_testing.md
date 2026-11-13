---
name: typescript_testing
version: 1.0.0
description: Testing conventions for TypeScript projects using Vitest, fast-check and Playwright
tags: [typescript, testing]
depends_on: [typescript_base]
---

# Standards: TypeScript Testing

How to write and run tests in TypeScript projects, layered on `typescript_base`. It is a separate layer so any TypeScript project (Node, web, or Electron) can load it with the `testing` tag. Node-specific runner setup is in `typescript_node`; shell-specific end-to-end rules are in `typescript_electron`.

This file assumes `typescript_base` is loaded (per `depends_on`). It overrides the test-naming shape and runner in `javascript_node` (Testing Requirements) for TypeScript projects; the minimum-coverage rule there still applies.

---

## Tooling

| Purpose                    | Tool       | Notes                                                                  |
| -------------------------- | ---------- | ---------------------------------------------------------------------- |
| Unit and integration tests | Vitest     | Import `describe`, `it`, `expect` from `vitest`; do not enable globals |
| Property-based tests       | fast-check | Run inside Vitest                                                      |
| End-to-end tests           | Playwright | Drives a real browser or the packaged app                              |

Test code is TypeScript under the same compiler options, lint rules and formatting as production code (see `typescript_base`). `any`, non-null assertions and unchecked casts are as forbidden in tests as elsewhere; `// @ts-expect-error` with a reason is allowed for tests of the type system itself.

---

## Kinds and Placement

A test's kind is decided by the most expensive resource it touches, not by how much code it covers.

| Kind        | Rule                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | One process, deterministic. No real file system, network, child process or browser engine; time comes from the injected `Clock`. A simulated DOM is allowed for component tests |
| Integration | One machine: real temporary folders, real adapters, a real browser engine for the renderer, loopback                                                                            |
| End-to-end  | The running app on a real window or browser, driven through its user interface                                                                                                  |

- **Unit tests are colocated** next to the code as `{module}.test.ts`, consistent with `javascript_node`. Every other kind lives in its own folder, which the project's standards name.
- Test files never reach build output or packages, and production code never imports them.
- Techniques are not kinds: property, snapshot and fixture-compatibility tests go in whichever kind their resources put them.
- Each kind is runnable on its own, with its own script.

---

## Naming and Structure

Test names state the **subject**, the **condition**, and the **expected result**, as nested blocks that read as a sentence:

```typescript
import { describe, expect, it } from 'vitest';

import { parseTag } from './tag.js';

describe('parseTag', () => {
  describe('when the input is empty', () => {
    it('returns a failure naming the empty input', () => {
      expect(parseTag('')).toEqual({ ok: false, error: 'empty' });
    });
  });
});
```

- One behaviour per `it`. Arrange, act, assert, in that order, with no logic (loops, conditionals) in the test body.
- Test through the public API. Do not test private fields, or assert on call counts of internal helpers.
- Coverage minimum (from `javascript_node`): every exported function has a happy-path test, a test for each documented failure, and an empty or missing-input test where it accepts strings, arrays or objects.
- A test for a `Result` asserts both the `ok` flag and the value or error.

---

## Determinism

- Tests are deterministic and independent: no ordering dependence, no shared mutable state, no real clock, no unseeded randomness. Use the injected `Clock` or Vitest fake timers for time.
- **No real network in unit tests.** A unit-test setup file makes network access fail loudly (a stubbed `fetch` that throws) so a stray call is a visible failure, not a flaky pass.
- Test doubles implement the real interface (host, clock, store) and live beside the interface. Prefer a small fake over a mock that records calls.
- Fixtures and test data are synthetic. Never commit a copy of real personal, financial or credential data. Build fixtures through the validating constructors from `typescript_base`, not casts.
- A flaky test is fixed or removed with a recorded finding. Never retry it until green, and never weaken an assertion to pass.

---

## Property Tests

Use fast-check for invariants, where example tests would only sample the space. Good candidates: parse and serialise round trips, idempotence, conservation (a total is unchanged by splitting), ordering, and "never throws on any input" for parsers.

- Build arbitraries from the validating constructors of branded types so every generated value is valid.
- Tests are reproducible: when a property fails, the seed and counterexample path are printed. Replay with them, then add the counterexample as a plain example test.
- Never disable shrinking, and never reduce the number of runs to hide a failure.

---

## End-to-End Tests

- Locate controls by role and accessible name first, `data-testid` second; never by CSS class or visible-text position. See `typescript_react` Accessibility.
- No fixed sleeps. Rely on Playwright's auto-waiting and on explicit conditions (for example a "settled" hook that the app exposes to tests).
- Tests start from a known state (a fixture, a fresh profile) and clean up after themselves.
- Playwright browsers are installed by a separate CI step after `npm ci` (`npx playwright install --with-deps`); they are not part of the dependency install.

### Screenshot Baselines

- Baselines are kept **per operating system** (and per browser project). Fonts and rendering differ between systems, so baselines are never shared across them.
- Fix everything that varies: viewport size, device scale factor, locale, time zone, theme, reduced motion, and the clock. Mask regions that cannot be made stable.
- A baseline changes only with a deliberate visual change, in the same pull request as the change, and a reviewer looks at the image diff.
- When the bundled Chromium is pinned (for example by an Electron version), baselines move only when that pin does.

---

## Security Requirements

- [ ] Test data contains no real personal, financial or credential data
- [ ] Unit tests make no real network connection
- [ ] No test or fixture contains a secret; tests read none from the environment
- [ ] Test-only hooks in production code are enabled only by an explicit guard and are absent otherwise
