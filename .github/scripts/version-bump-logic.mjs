// ------------------------------
// version-bump-logic.mjs
//
// Author: Starvoxel AI Agent - 2026-11-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Pure logic for .github/scripts/check-version-bumps.mjs: version ordering and
 * the rule that `package.json`'s version must move with every change to
 * shipped content, so the release workflow tags one release per merged change.
 */

/**
 * Directories whose content ships to consumers; a change under one is a release.
 * Everything else (docs, tests, `.github/`, tooling config) is not.
 */
export const SHIPPED_DIRS = [
  'agents',
  'skills',
  'steering',
  'standards',
  'servers',
  'bundles',
  'projects',
  'bin',
  'lib',
];

/** Dependency manifests never count as shipped content, so Dependabot PRs stay exempt. */
const DEPENDENCY_FILES = new Set(['package.json', 'package-lock.json']);

/**
 * Whether `newV` is strictly newer than `oldV`, comparing dot/dash/plus-separated parts numerically.
 * @param {string|number} oldV
 * @param {string|number} newV
 * @returns {boolean} true when `oldV` is older than `newV`
 */
export function isOlder(oldV, newV) {
  const parse = (/** @type {string|number} */ v) =>
    String(v)
      .split(/[.+-]/)
      .map((n) => (Number.isNaN(Number(n)) ? 0 : Number(n)));
  const a = parse(oldV);
  const b = parse(newV);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false; // equal
}

/**
 * Whether a changed path is shipped content. Pure.
 * @param {string} path - Repo-relative path using `/`
 * @returns {boolean}
 */
function isShipped(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (DEPENDENCY_FILES.has(base)) return false;
  return SHIPPED_DIRS.some((dir) => path.startsWith(`${dir}/`));
}

/**
 * Paths among `changedPaths` that are shipped content. Pure.
 * @param {string[]} changedPaths - Repo-relative paths from `git diff --name-status`
 * @returns {string[]}
 */
export function shippedChanges(changedPaths) {
  return changedPaths.filter(isShipped);
}

/**
 * Whether the changed paths require a `package.json` version bump. Pure.
 * @param {string[]} changedPaths
 * @returns {boolean}
 */
export function needsPackageBump(changedPaths) {
  return shippedChanges(changedPaths).length > 0;
}

/**
 * Read the `version` of a `package.json` text; undefined when absent or unparsable. Pure.
 * @param {string} json
 * @returns {string|undefined}
 */
export function readVersion(json) {
  try {
    const version = JSON.parse(json)?.version;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The error for a shipped change whose `package.json` version did not move
 * forward, or null when the rule is met or does not apply. Pure.
 * @param {{ changedPaths: string[], baseJson: string|null, headJson: string|null }} input -
 *   `baseJson`/`headJson` are the `package.json` texts at the base and head refs, null when absent
 * @returns {string|null}
 */
export function packageBumpError({ changedPaths, baseJson, headJson }) {
  const shipped = shippedChanges(changedPaths);
  if (shipped.length === 0 || baseJson === null) return null;
  const baseVersion = readVersion(baseJson);
  if (baseVersion === undefined) return null; // nothing to compare against
  const shown = `${shipped.slice(0, 3).join(', ')}${shipped.length > 3 ? ', …' : ''}`;
  const headVersion = headJson === null ? undefined : readVersion(headJson);
  if (headVersion === undefined) {
    return `package.json: version field is missing or unreadable, but shipped content changed (${shown})`;
  }
  if (headVersion === baseVersion) {
    return `package.json: shipped content changed (${shown}) but version stayed at '${baseVersion}'`;
  }
  if (isOlder(headVersion, baseVersion)) {
    return `package.json: version went backwards ('${baseVersion}' -> '${headVersion}')`;
  }
  return null;
}

/**
 * Pick the branch a PR was most recently forked from: the candidate whose merge-base with HEAD is
 * the most recent. On a tie, `preferredRef` (the default branch) wins over an unrelated open
 * branch that merely contains the same tip, such as another PR that merged `main`; otherwise the
 * first candidate wins. Pure.
 * @param {Array<{ ref: string, date: number }>} candidates - Other branches with their merge-base commit time
 * @param {string} preferredRef - The ref to favour on a tie, e.g. `refs/remotes/origin/main`
 * @returns {string|null} The chosen ref, or null with no candidates
 */
export function pickParentRef(candidates, preferredRef) {
  let best = null;
  for (const candidate of candidates) {
    if (
      !best ||
      candidate.date > best.date ||
      (candidate.date === best.date && candidate.ref === preferredRef && best.ref !== preferredRef)
    ) {
      best = candidate;
    }
  }
  return best ? best.ref : null;
}
