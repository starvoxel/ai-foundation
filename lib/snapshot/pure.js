/**
 * Pure logic for source-freshness detection — no I/O. Shared by the I/O layer
 * (lib/snapshot/io.js) and the freshness checks in lib/commands/install.js
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
 * Compare a freshly computed snapshot against the one on disk.
 * @param {{ sources: Record<string, string> }} computed - Freshly computed hashes
 * @param {{ sources: Record<string, string> }|null} existing - Hashes recorded at install time (null if absent)
 * @returns {{ stale: boolean, added: string[], removed: string[], changed: string[] }}
 */
export function diffSnapshot(computed, existing) {
  if (!existing) {
    return {
      stale: true,
      added: Object.keys(computed.sources),
      removed: [],
      changed: [],
    };
  }

  const added = [];
  const removed = [];
  const changed = [];

  // Check for new or changed sources
  for (const [path, hash] of Object.entries(computed.sources)) {
    if (!(path in existing.sources)) {
      added.push(path);
    } else if (existing.sources[path] !== hash) {
      changed.push(path);
    }
  }

  // Check for removed sources
  for (const path of Object.keys(existing.sources)) {
    if (!(path in computed.sources)) {
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
 * Conservative by design: if there's nothing to compare against (no recorded
 * hashes, or no fresh hashes), the resource is treated as not current —
 * `aif install`/`--update` will reinstall it rather than assume freshness it
 * can't verify.
 *
 * @param {Record<string, string>|undefined} storedSourceHashes - Hashes recorded in the manifest at install time
 * @param {{ sources: Record<string, string> }|null|undefined} freshSnapshot - Freshly computed hashes
 * @returns {boolean}
 */
export function isFreshnessCurrent(storedSourceHashes, freshSnapshot) {
  if (!storedSourceHashes) return false;
  if (!freshSnapshot || !freshSnapshot.sources) return false;
  return !diffSnapshot(freshSnapshot, { sources: storedSourceHashes }).stale;
}
