/**
 * Pure logic for source-freshness detection — no I/O. Shared by the I/O layer
 * (lib/source-hashes/io.js) and the freshness checks in lib/commands/install.js
 * and lib/commands/status.js.
 */

/**
 * Determines whether a relative file path counts as a "runtime" file for
 * hashing purposes (excludes test files, which don't affect installed output).
 * @param {string} relPath - Path relative to the resource's source directory
 * @returns {boolean}
 */
export function isRuntimeFile(relPath) {
  return !relPath.startsWith('tests/') && !relPath.endsWith('.test.js');
}

/**
 * Compare freshly computed source hashes against the ones recorded at install time.
 * @param {Record<string, string>} fresh - Freshly computed path → hash
 * @param {Record<string, string>|null|undefined} recorded - Hashes recorded in the manifest (absent if none)
 * @returns {{ stale: boolean, added: string[], removed: string[], changed: string[] }}
 */
export function diffSourceHashes(fresh, recorded) {
  if (!recorded) {
    return { stale: true, added: Object.keys(fresh), removed: [], changed: [] };
  }

  const added = [];
  const removed = [];
  const changed = [];

  for (const [path, hash] of Object.entries(fresh)) {
    if (!(path in recorded)) {
      added.push(path);
    } else if (recorded[path] !== hash) {
      changed.push(path);
    }
  }

  for (const path of Object.keys(recorded)) {
    if (!(path in fresh)) {
      removed.push(path);
    }
  }

  const stale = added.length > 0 || removed.length > 0 || changed.length > 0;
  return { stale, added, removed, changed };
}

/**
 * Determines whether a manifest entry's recorded source hashes still match
 * freshly computed ones. Used to decide whether a bundle, server, or hook
 * resource needs reinstalling.
 *
 * Conservative by design: with nothing to compare against (no recorded or no
 * fresh hashes) the resource is treated as not current — `aif install`/`--update`
 * will reinstall it rather than assume freshness it can't verify.
 *
 * @param {Record<string, string>|undefined} recorded - Hashes recorded in the manifest at install time
 * @param {Record<string, string>|null|undefined} fresh - Freshly computed hashes
 * @returns {boolean}
 */
export function isFreshnessCurrent(recorded, fresh) {
  if (!recorded || !fresh) return false;
  return !diffSourceHashes(fresh, recorded).stale;
}
