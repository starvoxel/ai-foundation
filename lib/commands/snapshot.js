/**
 * snapshot command — computes source hashes for a bundle and writes
 * bundles/{name}/snapshot.json. Used by `aif status` to detect source
 * freshness without runtime file reads.
 *
 * Modes:
 *   aif snapshot                    — regenerate only stale snapshots (all bundles)
 *   aif snapshot --bundle <name>    — regenerate a specific bundle's snapshot
 *   aif snapshot --check            — verify snapshots are current, exit 1 if stale
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

import { resolveBundle, listBundles } from '../resolver.js';
import { SOURCE_DIRS } from '../constants.js';
import { collectFiles } from '../harnesses/base.js';

/**
 * Hash a file's contents with sha256 prefix.
 * @param {string} filePath
 * @returns {string}
 */
function hashFile(filePath) {
  const content = readFileSync(filePath);
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}

/**
 * Compute source hashes for a resolved bundle.
 * @param {import('../resolver.js').ResolvedBundle} resolved
 * @param {string} repoRoot
 * @returns {Record<string, string>} relative path → hash
 */
export function computeSourceHashes(resolved, repoRoot) {
  const sources = {};

  // Agents
  for (const file of resolved.agents) {
    const relPath = `agents/${file}`;
    const absPath = join(repoRoot, relPath);
    if (existsSync(absPath)) {
      sources[relPath] = hashFile(absPath);
    }
  }

  // Steering (already relative paths)
  for (const relPath of resolved.steering) {
    const absPath = join(repoRoot, relPath);
    if (existsSync(absPath)) {
      sources[relPath] = hashFile(absPath);
    }
  }

  // Skills (all files in each skill directory)
  for (const skillName of resolved.skills) {
    const skillDir = join(repoRoot, 'skills', skillName);
    const files = collectFiles(skillDir);
    for (const file of files) {
      const relPath = `skills/${skillName}/${file}`;
      const absPath = join(skillDir, file);
      sources[relPath] = hashFile(absPath);
    }
  }

  // Servers (runtime files only — exclude tests/ and .test.js)
  for (const serverName of resolved.servers) {
    const serverDir = join(repoRoot, 'servers', serverName);
    const allFiles = collectFiles(serverDir);
    const runtimeFiles = allFiles.filter(f =>
      !f.startsWith('tests/') && !f.endsWith('.test.js')
    );
    for (const file of runtimeFiles) {
      const relPath = `servers/${serverName}/${file}`;
      const absPath = join(serverDir, file);
      sources[relPath] = hashFile(absPath);
    }
  }

  return sources;
}

/**
 * Build a snapshot object for a bundle.
 * @param {string} bundleName
 * @param {string} repoRoot
 * @returns {{ bundle: string, version: string, computed_at: string, sources: Record<string, string> }}
 */
export function buildSnapshot(bundleName, repoRoot) {
  const resolved = resolveBundle(bundleName, repoRoot);
  const sources = computeSourceHashes(resolved, repoRoot);

  return {
    bundle: bundleName,
    version: resolved.version,
    computed_at: new Date().toISOString(),
    sources,
  };
}

/**
 * Read the existing snapshot file for a bundle, or null if it doesn't exist.
 * @param {string} bundleName
 * @param {string} repoRoot
 * @returns {object|null}
 */
export function readSnapshot(bundleName, repoRoot) {
  const snapshotPath = join(repoRoot, SOURCE_DIRS.bundles, bundleName, 'snapshot.json');
  if (!existsSync(snapshotPath)) return null;
  try {
    return JSON.parse(readFileSync(snapshotPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write a snapshot to disk.
 * @param {string} bundleName
 * @param {object} snapshot
 * @param {string} repoRoot
 */
function writeSnapshot(bundleName, snapshot, repoRoot) {
  const snapshotPath = join(repoRoot, SOURCE_DIRS.bundles, bundleName, 'snapshot.json');
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
}

/**
 * Compare a freshly computed snapshot against the one on disk.
 * @param {object} computed - Freshly computed snapshot
 * @param {object|null} existing - Snapshot read from disk (null if absent)
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
 * Run the snapshot command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runSnapshot(parsed, repoRoot) {
  const checkMode = Boolean(parsed.args.check);
  const bundleName = parsed.args.bundle;

  // Determine which bundles to process
  let bundleNames;
  if (bundleName) {
    if (typeof bundleName !== 'string') {
      console.error('Missing value for --bundle');
      return 1;
    }
    bundleNames = [bundleName];
  } else {
    bundleNames = listBundles(repoRoot);
    if (bundleNames.length === 0) {
      console.log('No bundles found.');
      return 0;
    }
  }

  if (checkMode) {
    return runCheck(bundleNames, repoRoot);
  }

  return runGenerate(bundleNames, repoRoot);
}

/**
 * Check mode — verify snapshots are current without writing.
 * @param {string[]} bundleNames
 * @param {string} repoRoot
 * @returns {number} exit code (0 = all current, 1 = stale)
 */
function runCheck(bundleNames, repoRoot) {
  let anyStale = false;

  for (const name of bundleNames) {
    let computed;
    try {
      computed = buildSnapshot(name, repoRoot);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      anyStale = true;
      continue;
    }

    const existing = readSnapshot(name, repoRoot);
    const diff = diffSnapshot(computed, existing);

    if (diff.stale) {
      anyStale = true;
      const parts = [];
      if (diff.added.length > 0) parts.push(`${diff.added.length} added`);
      if (diff.changed.length > 0) parts.push(`${diff.changed.length} changed`);
      if (diff.removed.length > 0) parts.push(`${diff.removed.length} removed`);
      console.log(`  ⚠ ${name}: stale (${parts.join(', ')})`);
    } else {
      console.log(`  ✓ ${name}: up to date`);
    }
  }

  return anyStale ? 1 : 0;
}

/**
 * Generate mode — recompute and write only stale snapshots.
 * @param {string[]} bundleNames
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function runGenerate(bundleNames, repoRoot) {
  let updated = 0;
  let current = 0;

  for (const name of bundleNames) {
    let computed;
    try {
      computed = buildSnapshot(name, repoRoot);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      continue;
    }

    const existing = readSnapshot(name, repoRoot);
    const diff = diffSnapshot(computed, existing);

    if (diff.stale) {
      writeSnapshot(name, computed, repoRoot);
      const count = Object.keys(computed.sources).length;
      console.log(`  ✓ ${name}: snapshot updated (${count} sources)`);
      updated++;
    } else {
      console.log(`  ✓ ${name}: already current`);
      current++;
    }
  }

  if (updated > 0) {
    console.log(`\n${updated} snapshot(s) updated${current > 0 ? `, ${current} already current` : ''}.`);
  } else {
    console.log('\nAll snapshots up to date.');
  }

  return 0;
}
