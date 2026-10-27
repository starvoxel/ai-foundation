# Plan: Remove committed snapshots

| Field       | Value                             |
| ----------- | --------------------------------- |
| Status      | Draft                             |
| Approved by | jeremysmellie@gmail.com (in chat) |
| Created     | 2026-10-27                        |

## Goal

Stop committing `snapshot.json` files, which are generated state that conflicts between parallel branches (a `computed_at` line that changes on every regeneration, adjacent hash lines, and a `main` that goes stale when two clean PRs each update only their own hashes). Freshness detection computes source hashes on demand instead, as `aif index architecture` already does for the arc42 index.

## Scope

- In: delete the five committed snapshots; compute hashes at install and status time; remove the `aif snapshot` command, its CI step and the config that ignores snapshot files; update docs and skills that reference it; bump versions as the repo's version-bump check requires.
- Out: changing what install resolves (`resolveBundle` already reads sources directly; the snapshot never held bundle membership); any new cache or precomputed manifest; changes to the `.installs.yaml` format.

## Approach

- Evidence: `installBundle` and `isCurrent` use the snapshot only for freshness. A full hash of all five resources takes about 0.23s (`aif snapshot --check`, 73 tracked source files), so on-demand hashing is cheap.
- Keep the hash computation: `computeBundleSourceHashes`, `computeServerSourceHashes`, `computeHookSourceHashes`, `hashRuntimeFiles` and the pure `diffSnapshot`/`isFreshnessCurrent`/`isRuntimeFile`. Drop what only served the file: `readSnapshot`/`readServerSnapshot`/`readHookSnapshot`, the `write*` functions, `computed_at`, the `version` field of the bundle snapshot, `isRuntimeFile`'s `snapshot.json` exclusion, and `RESOURCE_KINDS`' read/write/list generate loop.
- `install.js` and `status.js` call a single `computeSourceHashes(kind, name, repoRoot)` instead of reading a file. The `sourceHashes` stored in `.installs.yaml` keep the same `path → sha256` shape, so existing installs stay valid and are not reinstalled by this change.
- Behaviour change in `aif status`: with no committed snapshot there is no "No snapshot found" state; a resource that cannot be hashed is reported as an error instead.
- `aif snapshot` is removed. `COMMANDS` and the help text lose it; running it gives the CLI's normal unknown-command error.
- Rename to match the new flow, since no snapshot exists any more: `lib/snapshot/` becomes `lib/source-hashes/`; `diffSnapshot` becomes `diffSourceHashes`; `computeSourceSnapshot` becomes `computeResourceHashes` and returns the plain `path → sha256` record instead of a `{ sources }` wrapper, so `isFreshnessCurrent` and `diffSourceHashes` take records too; `tests/unit/snapshot.test.js` becomes `tests/unit/source-hashes.test.js`. No behaviour change.
- Architecture docs affected: 06 (Freshness detection), 05.03, 05.05, 05.01, 05.02 and 03. Each is re-read against the change; sections whose key_files change get edited, not waived.

## Milestones

### 1. On-demand hashing

- Does: add `computeSourceHashes(kind, name, repoRoot)` in `lib/snapshot/io.js` (pure decisions stay in `pure.js`); switch `install.js` (`isCurrent`, manifest `sourceHashes`) and `status.js` to it; remove the read/write functions and the "no snapshot" paths. The snapshot files still exist but are no longer read.
- Acceptance criteria: install records the same hashes as before; a changed source marks the bundle stale in `aif status` and triggers reinstall under `--update`; an unchanged one is a no-op; a bundle, server or hook that cannot be hashed produces an error, not a silent "current".
- Verified by: `tests/integration/install-freshness.test.js` rewritten to drive freshness through source edits (no `runSnapshot` call); `tests/unit/snapshot.test.js` trimmed to the retained pure functions; `npm test`.

### 2. Remove the command, files and CI step

- Does: delete `lib/commands/snapshot.js`, `tests/integration/snapshot-command.test.js` and the five `snapshot.json` files; remove `snapshot` from `bin/aif.js` (command, flags `--server`/`--hook`/`--check` if only used here, help examples) and `COMMANDS`; drop the CI "snapshot freshness" step and the prettier and eslint ignores; fix `tests/integration/resolver-requires-skills.test.js`, which imports `computeBundleSourceHashes`.
- Acceptance criteria: no file or config references `snapshot.json` or `aif snapshot`; CI has no snapshot step; `aif install`/`status` work on a clean checkout; `npm run lint`, `typecheck`, `format:check` and `validate` pass.
- Verified by: `grep` for the removed names; the full CI command list run locally.

### 3a. Rename to the source-hashes flow

- Does: the renames listed under Approach, with every import, JSDoc type and comment updated.
- Acceptance criteria: no `snapshot` identifier, path or comment remains outside the plan and `docs/research`; behaviour unchanged.
- Verified by: `grep -ri snapshot` outside the allowed places; `npm test`, lint, typecheck.

### 3b. Docs, skills, versions

- Does: update README (commands list, "Snapshots detect source staleness" line), the authoring skills' checklists (`component-authoring/SKILL.md`, `reference/bundle.md`, `reference/server.md` drop "`aif snapshot` passes"), and the arc42 sections listed above including their `key_files`; bump the versions the version-bump check demands for the changed skills and bundles, and the package version for the removed command.
- Acceptance criteria: `aif index architecture --check` passes with no unexplained waivers; `aif validate` passes; the version-bump check passes against `main`.
- Verified by: those commands, run locally as the last step before pushing.

## Requirements

- Security: no new input surface. Hashing reads only files already under the repo's resource directories; keep the existing path handling in `collectFiles`.
- Logging: no new logging. `aif status` must name the resource and the reason when a hash cannot be computed, rather than reporting it as current.

## Decisions

- `aif snapshot` is removed outright, with no deprecation period (human, in chat).
- Revised after approval: the human asked for the rename in this change (milestone 3a), so it is no longer a follow-up.
- CI: the snapshot freshness step is removed (done in milestone 2); nothing replaces it because nothing is committed that could go stale.
