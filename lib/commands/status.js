/**
 * status command — reads the manifest, reports what's installed,
 * flags stale files (hash mismatch with installed content),
 * and reports source freshness by comparing against each resource's own
 * snapshot.
 *
 * Bundles, servers, and hooks are reported as separate sections — servers
 * and hooks are shared resources tracked independently of any one bundle
 * (see lib/manifest.js), so their freshness is shown once, not duplicated
 * per referencing bundle.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { readManifest } from '../manifest.js';
import { readSnapshot, readServerSnapshot, readHookSnapshot } from './snapshot.js';
import { diffSnapshot } from '../snapshot/pure.js';
import { manifestKey } from '../constants.js';

/**
 * Check installed file integrity against recorded hashes.
 * @param {Array<{path: string, hash: string}>} files
 * @returns {{ total: number, current: number, stale: number, missing: number }}
 */
function checkFileIntegrity(files) {
  let current = 0;
  let stale = 0;
  let missing = 0;

  for (const file of files) {
    if (!existsSync(file.path)) {
      missing++;
      continue;
    }
    const content = readFileSync(file.path, 'utf8');
    const hash = 'sha256:' + createHash('sha256').update(content).digest('hex');
    if (hash === file.hash) {
      current++;
    } else {
      stale++;
    }
  }

  return { total: files.length, current, stale, missing };
}

/**
 * Compare a resource's recorded source hashes against a freshly read snapshot.
 * @param {Record<string, string>|undefined} sourceHashes
 * @param {{ sources: Record<string, string> }|null} freshSnapshot
 * @returns {{ hasFreshness: boolean, stale?: boolean, added?: string[], removed?: string[], changed?: string[] }}
 */
function checkFreshness(sourceHashes, freshSnapshot) {
  if (!sourceHashes || !freshSnapshot || !freshSnapshot.sources) {
    return { hasFreshness: false };
  }
  return { hasFreshness: true, ...diffSnapshot(freshSnapshot, { sources: sourceHashes }) };
}

function printFreshnessLine(freshness) {
  if (!freshness.hasFreshness || !freshness.stale) return;
  const parts = [];
  if (freshness.added.length > 0) parts.push(`${freshness.added.length} added`);
  if (freshness.changed.length > 0) parts.push(`${freshness.changed.length} changed`);
  if (freshness.removed.length > 0) parts.push(`${freshness.removed.length} removed`);
  console.log(`      Source freshness: ${parts.join(', ')}`);
}

/**
 * Report the bundles section.
 * @param {object} manifest
 * @param {string} repoRoot
 * @returns {void}
 */
function reportBundles(manifest, repoRoot) {
  const keys = Object.keys(manifest.bundles);
  if (keys.length === 0) return;

  console.log('Bundles:');
  for (const key of keys) {
    const entry = manifest.bundles[key];
    const [bundle, harness] = key.split('_');
    const integrity = checkFileIntegrity(entry.files);
    const freshness = checkFreshness(entry.sourceHashes, readSnapshot(bundle, repoRoot));

    let dependencyStale = false;
    for (const serverName of entry.servers || []) {
      const serverEntry = manifest.servers[manifestKey(serverName, harness)];
      const f = checkFreshness(serverEntry && serverEntry.sourceHashes, readServerSnapshot(serverName, repoRoot));
      if (f.hasFreshness && f.stale) dependencyStale = true;
    }
    for (const hookName of entry.hooks || []) {
      const hookEntry = manifest.hooks[manifestKey(hookName, harness)];
      const f = checkFreshness(hookEntry && hookEntry.sourceHashes, readHookSnapshot(hookName, repoRoot));
      if (f.hasFreshness && f.stale) dependencyStale = true;
    }

    const hasTargetIssues = integrity.stale > 0 || integrity.missing > 0;
    const hasSourceIssues = Boolean(freshness.hasFreshness && freshness.stale);
    const status = hasTargetIssues || hasSourceIssues || dependencyStale ? '⚠' : '✓';

    console.log(`  ${status} ${bundle} → ${harness} (v${entry.version})`);
    console.log(`      ${integrity.total} files: ${integrity.current} current, ${integrity.stale} stale, ${integrity.missing} missing`);
    printFreshnessLine(freshness);

    if (entry.servers && entry.servers.length > 0) {
      console.log(`      servers: ${entry.servers.join(', ')}`);
    }
    if (entry.hooks && entry.hooks.length > 0) {
      console.log(`      hooks: ${entry.hooks.join(', ')}`);
    }
    if (dependencyStale) {
      console.log('      One or more server/hook dependencies are stale (see Servers/Hooks below).');
    }

    if (hasTargetIssues || hasSourceIssues || dependencyStale) {
      console.log('      Run `aif install --update` to update.');
    } else if (!freshness.hasFreshness && !readSnapshot(bundle, repoRoot)) {
      console.log('      No snapshot found. Run `aif snapshot` to enable freshness detection.');
    }
  }
}

/**
 * Report a shared-resource section (servers or hooks) — same shape, reused
 * for both.
 * @param {string} title
 * @param {object} sectionEntries - manifest.servers or manifest.hooks
 * @param {(name: string, repoRoot: string) => object|null} readResourceSnapshot
 * @param {string} repoRoot
 * @returns {void}
 */
function reportSharedResourceSection(title, sectionEntries, readResourceSnapshot, repoRoot) {
  const keys = Object.keys(sectionEntries);
  if (keys.length === 0) return;

  console.log(`\n${title}:`);
  for (const key of keys) {
    const entry = sectionEntries[key];
    const [name, harness] = key.split('_');
    const integrity = checkFileIntegrity(entry.files);
    const freshness = checkFreshness(entry.sourceHashes, readResourceSnapshot(name, repoRoot));
    const hasIssues = integrity.stale > 0 || integrity.missing > 0 || Boolean(freshness.hasFreshness && freshness.stale);
    const status = hasIssues ? '⚠' : '✓';
    const owners = Array.isArray(entry.installedBy) ? entry.installedBy.join(', ') : '';

    console.log(`  ${status} ${name} → ${harness} (shared by: ${owners || 'none'})`);
    console.log(`      ${integrity.total} files: ${integrity.current} current, ${integrity.stale} stale, ${integrity.missing} missing`);
    printFreshnessLine(freshness);

    if (hasIssues) {
      console.log('      Run `aif install --update` on a depending bundle to update.');
    }
  }
}

/**
 * Run the status command.
 * @param {{ args: Record<string, string>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runStatus(parsed, repoRoot) {
  const manifest = readManifest(repoRoot);
  const nothingInstalled =
    Object.keys(manifest.bundles).length === 0 &&
    Object.keys(manifest.servers).length === 0 &&
    Object.keys(manifest.hooks).length === 0;

  if (nothingInstalled) {
    console.log('Nothing installed.');
    return 0;
  }

  reportBundles(manifest, repoRoot);
  reportSharedResourceSection('Servers', manifest.servers, readServerSnapshot, repoRoot);
  reportSharedResourceSection('Hooks', manifest.hooks, readHookSnapshot, repoRoot);

  return 0;
}
