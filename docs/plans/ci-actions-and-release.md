# Plan: Reusable CI actions and release workflow

| Field       | Value                             |
| ----------- | --------------------------------- |
| Status      | Approved                          |
| Approved by | jeremysmellie@gmail.com (in chat) |
| Created     | 2026-11-23                        |

## Goal

Consumer repos (first: Folio) cannot run `aif` in CI without copying shell steps. Ship two composite GitHub Actions, `index` and `bundles`, and a release workflow that tags `v<version>`, so consumers pin an action by commit SHA and Dependabot's `github-actions` ecosystem bumps it.

## Scope

- In: `.github/actions/index` and `.github/actions/bundles` (`action.yml` + README each); `.github/workflows/release.yml`; two small scripts under `.github/scripts/` with unit tests; a validation test for the action files; a new arc42 section (§5.07) with consumer usage; `package.json` version bump.
- Out: changing `isCurrent()`, npm publishing, any change to Folio, other actions.
- Also in (added on review): a CI check that `package.json`'s version moves with every change to shipped content, so the release workflow fires once per merged change.

## Approach

- **Actions.** Composite; each has a `mode` input validated in bash (`case`, unknown value exits 1). Steps, all `shell: bash`: resolve the AIF root as `$GITHUB_ACTION_PATH/../../..` (passed through env, not interpolated into the script); `npm ci --omit=dev` there; run `node "$ROOT/bin/aif.js" …` in the caller's cwd. No secrets, no network beyond `npm ci`. READMEs state the caller must run `actions/setup-node` and check out its repo (`index` needs `fetch-depth: 0`) and show `uses: starvoxel/ai-foundation/.github/actions/index@<sha> # vX.Y.Z`.
- **`index`:** `check` (default) → `aif index architecture --check`; `generate` → `aif index architecture`.
- **`bundles`:** `check` → `aif install --scope project --check` (exits 0 by design, so the step never fails on drift; a crash of aif itself still fails, not masked); `update` → `aif install --scope project --update`, then `.github/scripts/harness-changes.mjs` sets output `changed`. It runs `git status --porcelain` limited to the dirs in `PROJECT_HARNESS_DIRS` (`lib/scope.js`, no duplicated list) and writes `changed=true|false` to `$GITHUB_OUTPUT`. The "N updated" count is ignored. Pure `hasChanges(porcelain)` is unit-tested; the wrapper is thin.
- **Release.** `release.yml`: `on: push: branches: [main]`, top-level `permissions: {}`, one job with `contents: write`. Steps: checkout (SHA-pinned as in `ci.yml`, `persist-credentials: false`, `fetch-depth: 0` for tags), `node .github/scripts/release-tag.mjs` (pure `releaseTag(version, tags)` returns `v<version>` when that tag does not exist, else nothing; unit-tested), then `gh release create "$TAG" --target "$GITHUB_SHA" --generate-notes` with `GH_TOKEN` from `github.token`. `gh` is preinstalled, so no third-party action to pin. It runs only after the merge, whose required checks already gated `main`; the workflow neither changes nor waits on them. `concurrency` serialises runs.
- **Validation test.** `tests/validation/` parses each `.github/actions/*/action.yml` and asserts every `run:` step sets `shell: bash`, plus a `using: composite` and `mode` input check.
- **Docs.** New `docs/architecture/05_07_ci_actions_and_release.md` (key_files: the two `action.yml`, the two scripts, `release.yml`) with consumer usage and the SHA + Dependabot flow; a line in `05_building_blocks.md`. Existing sections' `key_files` are untouched, so no waivers are expected.
- **`package.json` bump check.** Extend `.github/scripts/check-version-bumps.mjs` (same `sha`/`auto-parent` diff bases as today) with a pure `needsPackageBump(changedFiles)`: true when any changed file is under `agents/ skills/ steering/ standards/ servers/ bundles/ projects/ bin/ lib/`, excluding `package.json`/`package-lock.json` anywhere (so Dependabot PRs, which only touch those, stay exempt and keep auto-merging). When true, `package.json`'s `version` must differ from the base's, else the existing Check: version bump step fails. Unit tests extend `check-version-bumps` tests.
- **Windows.** A separate `.github/workflows/windows-actions.yml`, `workflow_dispatch` only (never on push or PR, so no required check and no cost per change), runs both actions from the checkout on `windows-latest` (`uses: ./.github/actions/index`, `bundles` in `check` mode) to verify the Git Bash path handling on demand. `ci.yml` is untouched.
- **Version.** `package.json` 0.3.0 → 0.4.0 (new feature). The first release tag `v0.4.0` is created when this merges.

## Milestones

### 1. Actions, scripts, tests

- Does: both actions with READMEs, `harness-changes.mjs`, `release-tag.mjs`, unit and validation tests.
- Acceptance criteria: both `action.yml` parse; every `run:` has `shell: bash`; invalid `mode` fails; `hasChanges`/`releaseTag` tests pass; running the action steps by hand in a scratch git repo with a `.claude` install gives `changed=false` then `true` after a file edit.
- Verified by: `npm test`, lint, typecheck, format check, and the manual scratch-repo run.

### 2. `package.json` bump check

- Does: `needsPackageBump` plus its wiring in `check-version-bumps.mjs`; this PR's own bump satisfies it.
- Acceptance criteria: a change under a shipped dir without a `package.json` version change fails; docs-only, `.github/`-only and dependency-only (Dependabot-shaped) changes pass; a bump passes.
- Verified by: unit tests for the pure function, an integration test in `tests/integration/check-version-bumps.test.js`, and CI on the PR.

### 3. Release workflow, manual Windows workflow, docs, version

- Does: `release.yml`, the manual Windows workflow, §5.07 and building-blocks link, version bump.
- Acceptance criteria: `aif index architecture --check` and `npm run validate` pass; workflow follows `ci.yml` pinning and least privilege.
- Verified by: local checks, independent review, CI on the PR.

## Requirements

- Security: no secrets in actions; no network beyond `npm ci`; env-var indirection for paths; release job is the only one with `contents: write`; third-party actions SHA-pinned with a version comment; required checks untouched.
- Logging: each action echoes the mode and command it runs; the release job prints the tag it creates or "no release needed".

## Open questions

- **Bump-check trigger paths.** The shipped-dir list above is my proposal for what counts as "a change" (the repo has no other definition); confirm or amend at approval.
- **Windows workflow** is manual only, per your decision; it is a new workflow file, not a `ci.yml` job.

Decided: re-run-safe tag test (`v<version>` absent), not literal latest-tag comparison.
