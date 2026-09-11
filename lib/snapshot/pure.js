/**
 * Pure logic for the snapshot subsystem — no I/O. Shared by the CLI
 * orchestrator (lib/commands/snapshot.js), the I/O layer (lib/snapshot/io.js),
 * and freshness checks in lib/commands/install.js.
 */

/**
 * Determines whether a relative file path counts as a "runtime" file for
 * hashing purposes (excludes test files, which don't affect installed output,
 * and the resource's own snapshot.json, which would otherwise self-reference
 * and never reach a stable hash).
 * @param {string} relPath - Path relative to the resource's source directory
 * @returns {boolean}
 */
export function isRuntimeFile(relPath) {
  return (
    !relPath.startsWith('tests/') && !relPath.endsWith('.test.js') && relPath !== 'snapshot.json'
  );
}

/**
 * Compare a freshly computed snapshot against the one on disk.
 * @param {{ sources: Record<string, string> }} computed - Freshly computed snapshot
 * @param {{ sources: Record<string, string> }|null} existing - Snapshot read from disk (null if absent)
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
 * Determines whether a manifest entry's recorded source hashes still match a
 * freshly computed snapshot. Used to decide whether a bundle, server, or hook
 * resource needs reinstalling.
 *
 * Conservative by design: if there's nothing to compare against (no recorded
 * hashes, or no snapshot on disk), the resource is treated as not current —
 * `aif install`/`--update` will reinstall it rather than assume freshness it
 * can't verify.
 *
 * @param {Record<string, string>|undefined} storedSourceHashes - Hashes recorded in the manifest at install time
 * @param {{ sources: Record<string, string> }|null|undefined} freshSnapshot - Freshly read/computed snapshot
 * @returns {boolean}
 */
export function isFreshnessCurrent(storedSourceHashes, freshSnapshot) {
  if (!storedSourceHashes) return false;
  if (!freshSnapshot || !freshSnapshot.sources) return false;
  return !diffSnapshot(freshSnapshot, { sources: storedSourceHashes }).stale;
}

/**
 * Parse `--{kind} [name]` style CLI args into explicit snapshot targets.
 * Pure — does not touch the filesystem or decide what "all" resolves to
 * (that requires listing directories, which is the caller's job whenever
 * this function returns an empty target list, or a target with `name: null`).
 *
 * A bare flag with no value (`--bundle` alone) is a wildcard for that kind —
 * `name: null` — meaning "every resource of this kind," not an error. A flag
 * given an empty-string value is still rejected, since that can only come
 * from a malformed invocation (e.g. `--bundle ""`), never from an intentional
 * bare flag.
 *
 * @param {Record<string, string|boolean>} args - Parsed CLI args
 * @param {string[]} kindNames - Recognized resource kinds, e.g. ["bundle", "server", "hook"]
 * @returns {{ ok: true, targets: Array<{ kind: string, name: string|null }> } | { ok: false, error: string }}
 */
export function resolveExplicitTargets(args, kindNames) {
  const targets = [];

  for (const kind of kindNames) {
    const value = args[kind];
    if (value === undefined) continue;
    if (value === true) {
      targets.push({ kind, name: null });
      continue;
    }
    if (typeof value !== 'string' || value.length === 0) {
      return { ok: false, error: `Invalid value for --${kind}` };
    }
    targets.push({ kind, name: value });
  }

  return { ok: true, targets };
}
