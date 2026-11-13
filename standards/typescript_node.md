---
name: typescript_node
version: 1.0.0
description: Node.js-side TypeScript conventions, npm 12 supply-chain hardening, and CI rules for TypeScript projects
tags: [typescript, node]
depends_on: [typescript_base, javascript_node]
---

# Standards: TypeScript Node

Conventions for TypeScript that runs in Node.js (servers, CLIs, build tooling, the Electron main process, and tests that run in Node), layered on `typescript_base` and `javascript_node`. Package management, supply chain and CI rules for any npm-based TypeScript project also live here.

This file assumes `typescript_base` and `javascript_node` are loaded (per `depends_on`). Where this file disagrees with `javascript_node`, this file wins; the Overrides section lists every case. All other `javascript_node` rules (`node:` prefix, path handling, async I/O, CLI conventions, logging levels, security checklist) apply unchanged to `.ts` files.

---

## Stack Baseline

| Layer           | Convention                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Runtime         | A Node.js version npm 12 supports (`^22.22.2 \|\| ^24.15.0 \|\| >=26`), pinned in `engines` and in CI       |
| Module system   | ES Modules: `"type": "module"` in `package.json`                                                            |
| Package manager | npm 12 with workspaces (see Package Management). pnpm is the documented alternative                         |
| Type-check      | `tsc --noEmit`, with `module` and `moduleResolution` set to `NodeNext`                                      |
| Test runner     | Vitest (overrides `javascript_node`'s `node:test`); the rules for writing tests are in `typescript_testing` |

How Node-side TypeScript is executed (compiled with `tsc`, bundled, or run through a loader) is a project decision. Whichever is chosen must keep NodeNext resolution rules, and the type-check above must still pass on its own.

---

## Overrides of `javascript_node`

| `javascript_node` rule                           | This standard                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Stack Baseline: runtime, testing                 | Per Stack Baseline above                                                                                    |
| File Extensions in Import Specifiers             | Keep `.js` in relative specifiers although the source is `.ts` (see below)                                  |
| Project Structure: `{module}.js`, `.test.js`     | `{module}.ts` and a colocated `{module}.test.ts`; tests are excluded from build output and packages         |
| Testing Requirements: `node:test`, `node:assert` | Vitest, with imports from `vitest`; the minimum-coverage rule (happy path, each failure, empty input) stays |
| Logging Requirements                             | Adds the injected-logger rule below                                                                         |

### Import Specifiers

Under NodeNext, TypeScript requires the extension that Node will see at runtime, so write `.js` for a sibling `.ts` file. Never write `.ts` in an import specifier, and never drop the extension on Node-side code.

```typescript
// Correct
import { resolveBundle } from './resolver.js';

// Wrong — fails under NodeNext and at runtime
import { resolveBundle } from './resolver';
import { resolveBundle } from './resolver.ts';
```

Package `exports` must point at the files Node loads. Code shared with the renderer follows `typescript_base`'s Import Specifiers table.

### Logging

Long-running Node code takes a logger through an injected interface (`debug`, `info`, `warn`, `error`, each taking a message and a structured context object), never a global or `console.*`. Domain code that cannot import Node (see `typescript_base`, Platform-Neutral Code) receives the interface; the Node host supplies the implementation. Log levels follow `javascript_node`. Security events are never `debug`. Never log secrets, tokens, file contents, or personal or financial data, and never feed an audit log into diagnostic logging.

---

## Package Management and Supply Chain

### Baseline

npm 12 (released 2026-07-08) with workspaces. It blocks dependency lifecycle scripts by default. No stable Node release bundles npm 12 yet (Node 26 LTS bundles npm 11.20), so install it explicitly in CI and locally with `npm install -g npm@12`, and require it with `engines`:

```json
{
  "private": true,
  "type": "module",
  "engines": { "node": "^22.22.2 || ^24.15.0 || >=26", "npm": ">=12" }
}
```

Do not depend on Corepack: it is not shipped from Node 25.

- The root `package.json` is `private` and lists workspaces. Workspace packages are first-party code: their own scripts are not blocked, and they reference each other by workspace protocol or version, never by a path outside the repository.
- Commit `package-lock.json`. Pin every dependency to an exact version (`save-exact`), so a lockfile change is the only way a version moves.
- A new dependency, or a major-version bump of a runtime dependency, is a decision for the human (see `steering/global/core.md`: "Ask Rather Than Assume"), not an implementation detail.

### `.npmrc`

A project's committed `.npmrc` sets at least:

```ini
save-exact=true
engine-strict=true
strict-npmrc=true
strict-allow-scripts=true
min-release-age=7
audit-level=high
```

| Setting                | Effect                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `save-exact`           | `npm install` writes exact versions                                                                                                |
| `engine-strict`        | Install fails when Node or npm does not satisfy `engines`                                                                          |
| `strict-npmrc`         | An invalid or unknown `.npmrc` entry is an error, not silently ignored                                                             |
| `strict-allow-scripts` | A skipped dependency script fails the install. Without it, npm 12 skips blocked scripts quietly and exits 0                        |
| `min-release-age`      | Days a version must have been published before it can be installed. npm 11.10 and later; counts days and defaults to off, so set 7 |
| `audit-level`          | Lowest severity at which `npm audit` fails; the project may choose a stricter level than `high`                                    |

Leave `allow-git` and `allow-remote` at their default, `none`; never enable them to make an install work.

### Install scripts

- npm 12 runs a dependency's `preinstall`, `install` and `postinstall` (and `prepare` for non-registry dependencies) only if the root `package.json` lists the package in its `allowScripts` map. Write entries with `npm install-scripts approve`, never by hand-editing around a failing install.
- Every `allowScripts` entry is a reviewed, justified change in a pull request, stating why the script is needed. A package that needs no script gets no entry. Packages that ship their binary without an install script need no entry (see `typescript_electron` for Electron).
- Do not try to run blocked scripts through a wrapper script, `npm rebuild`, or an environment variable to get around the block.

### CI

- CI installs with `npm ci` (from the lockfile only, never `npm install`) and then runs `npm audit signatures`. A failure of either fails the build.
- CI installs npm 12 explicitly (`npm install -g npm@12`) before `npm ci`, and prints `node --version` and `npm --version`.
- Dependency licences are checked in CI: every runtime dependency must be MIT or an equivalent permissive licence, and no component may be paid. The project chooses the tool and keeps the allowlist in the repository; a dependency outside the allowlist is a decision for the human.

### Dependabot

- Enable Dependabot for the `npm` ecosystem and for `github-actions`.
- Group related updates (for example one group for the framework and its type packages) so a version moves as a set.
- Set Dependabot's own cooldown to the same number of days as `min-release-age`, so it never proposes a version npm would refuse to install.

### GitHub Actions

Third-party actions are pinned to a full commit SHA, with the release they correspond to in a trailing comment. A tag or branch is mutable and is never used for a third-party action.

```yaml
- uses: actions/checkout@<full-40-character-commit-sha> # v{release}
```

Dependabot updates the SHA and the comment together. Workflows request the least `permissions` they need, and a job that does not push or comment gets read-only permissions.

### Alternative: pnpm

pnpm is the documented alternative, not the default. It fails an install on unreviewed dependency scripts by default and has a minimum release age setting. Electron's packaging tools need its hoisted linker, which weakens the isolation that is the reason to choose it. A project that picks pnpm records the decision as an exception and keeps the equivalent rules above (exact versions, lockfile-only CI, signature verification, scripts reviewed, SHA-pinned actions).

---

## Security Requirements

Combine with `typescript_base` and `javascript_node`.

- [ ] `.npmrc` sets `save-exact`, `engine-strict`, `strict-npmrc`, `strict-allow-scripts`, `min-release-age` and `audit-level`
- [ ] Every `allowScripts` entry is justified in a reviewed change; none added to unblock a failing install
- [ ] CI uses `npm ci` and `npm audit signatures`, and never `npm install`
- [ ] Every third-party GitHub Action is pinned to a full commit SHA
- [ ] Dependabot cooldown equals `min-release-age`
- [ ] Dependency licences checked in CI; no paid component
- [ ] Domain code receives its logger, clock and file access by injection and imports nothing from `node:*`
