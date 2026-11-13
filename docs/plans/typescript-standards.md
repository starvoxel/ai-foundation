# Plan: TypeScript-family standards

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-13 |

## Goal

`standards/` has `javascript_base` and `javascript_node` but no TypeScript layers. Folio (a local-first Electron desktop budget app, decisions AD-14 to AD-20 in `starvoxel/folio`) needs them. Write layered stack-convention standards for TypeScript 7 strict, Node, React 19, Electron 45, and optionally Fluent UI React v9 and testing, so that Folio keeps only project-specific rules in its own `project-standards.md`.

## Scope

- In: new files under `standards/`; the `typescript_base (future)` pointer in `javascript_base`; its version bump and the bump of any other changed standard; the `standards/README.md` naming example only if it becomes wrong.
- Out: Folio's own kinds of test, folder layout, package names and product behaviour (they stay in Folio's `project-standards.md`); a steering procedure for the privacy capture unless the human chooses one (open question 2); a Folio PR; changes to `javascript_node` (its rules are overridden from the TypeScript layers, not edited).

## Approach

Layering, each file with front-matter `name`, `version`, `description`, `tags`, `depends_on`, and prose not hard-wrapped.

| File                        | Tags                            | depends_on                            | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript_base`           | `[typescript]`                  | `javascript_base`                     | Strict compiler options, no `any`, `unknown` plus schema (zod) at every trust boundary, branded types, no float money, no `Date` in domain code, injected clock, result values for expected failures, error subclasses with `cause`, override points of `javascript_base` (type system row, TSDoc, header block, import extensions), fflate, linear-time regex, Prettier and ESLint (typescript-eslint strict type-checked), dependency-cruiser |
| `typescript_node`           | `[typescript, node]`            | `typescript_base`, `javascript_node`  | NodeNext and `.js` specifiers, Vitest, npm 12 workspaces and supply chain (`allowScripts`, `min-release-age`, `.npmrc`, lockfile-only CI, signatures), CI and GitHub (SHA-pinned actions, Dependabot, licence check), overrides of `javascript_node`'s `node:test` and `.test.js` rules                                                                                                                                                         |
| `typescript_react`          | `[typescript, react]`           | `typescript_base`                     | React 19 function components and hooks, thin components, `useSyncExternalStore`, accessibility, `data-testid`, tokens not literals, design-system containment, Vite and bundler resolution, TanStack Virtual, ECharts behind chart models                                                                                                                                                                                                       |
| `typescript_electron`       | `[typescript, electron]`        | `typescript_node`, `typescript_react` | Process model, hardening, IPC and preload, custom protocol and CSP, permissions and navigation, privacy switches, fuses, packaging, Playwright on the packaged binary, Linux `.deb` and AppArmor; the privacy capture                                                                                                                                                                                                                           |
| `typescript_react_fluentui` | `[typescript, react, fluentui]` | `typescript_react`                    | Only rules that apply when `@fluentui/react-components` v9 is used                                                                                                                                                                                                                                                                                                                                                                              |
| `typescript_testing`        | `[typescript, testing]`         | `typescript_base`                     | Test naming, determinism and seeding, no real network in unit tests, fast-check, Playwright, per-OS screenshot baselines                                                                                                                                                                                                                                                                                                                        |

Adjustments to the proposed layering, with reasons:

- Supply chain, CI and GitHub rules sit in `typescript_node`, not a new file: they apply to any npm-based TypeScript project and `javascript_node` already names npm the default package manager. Raise if you would rather they live in `javascript_node` or steering.
- fflate, the schema library and the linear-time regex engine sit in `typescript_base` because the platform-neutral core uses them in Node, the browser and Electron.
- Vite, TanStack Virtual and ECharts sit in `typescript_react`: they are renderer concerns.
- Every stack item gets a rule or a one-line "no rule, because" (for example the later browser host and mobile wrapper: the layers must not block them, so Node and Electron imports are kept out of platform-neutral code).
- Facts about npm 12, Electron 45 and the other versions come from your brief and Folio's AD-17 to AD-20 and research brief; anything I cannot verify is flagged in the final report, not asserted. Web access belongs only to the researcher agent, so version claims I cannot confirm from those sources go to you or to a researcher dispatch you confirm.
- Architecture docs: `docs/architecture` does not describe standards content; I will check section 05.03 and 05.05 `key_files` for anything these files touch before the first push.

## Milestones

### 1. `typescript_base`

- Does: the language layer, plus the `javascript_base` pointer fix and version bumps.
- Acceptance criteria: front-matter complete; every language rule in the brief is present or deliberately absent with a reason; the four `javascript_base` override points are stated; no Folio-specific names; no hard-wrapped prose.
- Verified by: `aif validate`, `npm test`, `npx prettier --check`, `node skills/standards/scripts/resolve.js` against a scratch config listing each tag set.

### 2. `typescript_node`

- Does: Node-side TypeScript, tooling, package management, CI.
- Acceptance criteria: npm 12 facts as given in the brief; overrides of `javascript_node` explicit; `resolve.js` orders `javascript_base`, `typescript_base`, `javascript_node`, `typescript_node`.
- Verified by: as milestone 1.

### 3. `typescript_react`

- Does: React, Vite, TanStack Virtual, ECharts rules.
- Acceptance criteria: as in the brief's React list; nothing Electron-specific.
- Verified by: as milestone 1.

### 4. `typescript_electron`

- Does: all Electron rules in the brief, with the evidence cited by decision number.
- Acceptance criteria: every item in the brief's Electron list present; no Folio package names or paths; resolve order correct for a project tagged `typescript, node, react, electron`.
- Verified by: as milestone 1.

### 5. `typescript_react_fluentui` and `typescript_testing`

- Does: the Fluent UI layer and the testing standard, per decisions 3 and 4.
- Acceptance criteria: no rule duplicated across files; the testing standard holds no Folio-specific kinds of test.
- Verified by: as milestone 1.

### 6. Review and PR

- Does: independent review (`code-review` via the reviewer agent), fixes, push, PR.
- Acceptance criteria: reviewer reports no blocking findings.
- Verified by: reviewer report; CI green.

## Requirements

- Security: the Electron and boundary rules are the security content; they are written as checklists like `javascript_node`'s. No secrets in examples.
- Logging: the standards state a logging rule for Node-side code consistent with `javascript_node` (structured logging for long-running services, never log secrets or financial data).

## Decisions

Resolved by you on 2026-11-13:

1. Result-type style: a project-local discriminated-union `Result` type, no library.
2. The privacy-capture job lives inside `typescript_electron`.
3. `typescript_react_fluentui` is written now.
4. Testing is its own standard, `typescript_testing`.

## Open questions

- None outstanding.
