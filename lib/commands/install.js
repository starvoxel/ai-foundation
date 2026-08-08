/**
 * install command — resolves a bundle and delegates installation to the
 * harness adapter. Records results in the manifest.
 *
 * Modes:
 *   aif install --bundle <name> --harness <name>   — install a specific bundle
 *   aif install --update                           — update all installed bundles that are stale
 */

import { resolveBundle, listStandards } from '../resolver.js';
import * as kiro from '../harnesses/kiro.js';
import * as claude from '../harnesses/claude.js';
import { readManifest, setEntry, getEntry } from '../manifest.js';
import { HARNESSES, manifestKey } from '../constants.js';
import { readSnapshot } from './snapshot.js';

const adapters = {
  kiro,
  claude,
};

/**
 * Check if an installed bundle is current (no freshness issues).
 * @param {string} bundleName
 * @param {string} harness
 * @param {string} repoRoot
 * @returns {boolean} true if the bundle is installed and all sources are current
 */
function isCurrent(bundleName, harness, repoRoot) {
  const key = manifestKey(bundleName, harness);
  const entry = getEntry(repoRoot, key);
  if (!entry) return false;
  if (!entry.sourceHashes) return false;

  const snapshot = readSnapshot(bundleName, repoRoot);
  if (!snapshot || !snapshot.sources) return false;

  // Check for any differences
  const snapshotKeys = Object.keys(snapshot.sources);
  const manifestKeys = Object.keys(entry.sourceHashes);

  // Different number of sources = not current
  if (snapshotKeys.length !== manifestKeys.length) return false;

  // Any hash mismatch or missing key = not current
  for (const [path, hash] of Object.entries(snapshot.sources)) {
    if (entry.sourceHashes[path] !== hash) return false;
  }

  return true;
}

/**
 * Install a single bundle to a harness.
 * @param {string} bundleName
 * @param {string} harness
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function installBundle(bundleName, harness, repoRoot) {
  let resolved;
  try {
    resolved = resolveBundle(bundleName, repoRoot);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const adapter = adapters[harness];

  // Install standards (all available, loading is gated by resolution rules)
  const standardsFiles = listStandards(repoRoot);
  const files = [
    ...adapter.installStandards(standardsFiles, repoRoot),
    ...adapter.installAgents(resolved.agents, repoRoot),
    ...adapter.installSteering(resolved.steering, repoRoot),
    ...adapter.installSkills(resolved.skills, repoRoot),
    ...adapter.installServers(resolved.servers, repoRoot),
  ];

  // Record in manifest (include snapshot hashes for freshness detection)
  const key = manifestKey(bundleName, harness);
  const snapshot = readSnapshot(bundleName, repoRoot);
  const entry = {
    version: resolved.version,
    files,
    servers: resolved.servers,
  };
  if (snapshot && snapshot.sources) {
    entry.sourceHashes = snapshot.sources;
  }
  setEntry(repoRoot, key, entry);

  console.log(`\nInstalled bundle "${bundleName}" to ${harness} (${files.length} files)`);
  return 0;
}

/**
 * Update all installed bundles that are stale.
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function runUpdate(repoRoot) {
  const manifest = readManifest(repoRoot);
  const keys = Object.keys(manifest);

  if (keys.length === 0) {
    console.log('Nothing installed. Use `aif install --bundle <name> --harness <name>` first.');
    return 0;
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const key of keys) {
    const [bundle, harness] = key.split('_');

    if (isCurrent(bundle, harness, repoRoot)) {
      console.log(`✓ ${bundle} → ${harness}: already current`);
      skipped++;
      continue;
    }

    console.log(`↻ ${bundle} → ${harness}: updating...`);
    const code = installBundle(bundle, harness, repoRoot);
    if (code === 0) {
      updated++;
    } else {
      failed++;
    }
  }

  console.log(`\n${updated} updated, ${skipped} current${failed > 0 ? `, ${failed} failed` : ''}.`);
  return failed > 0 ? 1 : 0;
}

/**
 * Run the install command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runInstall(parsed, repoRoot) {
  // Update mode: refresh all stale installed bundles
  if (parsed.args.update) {
    return runUpdate(repoRoot);
  }

  const bundleName = parsed.args.bundle;
  const harness = parsed.args.harness;

  if (!bundleName) {
    console.error('Missing required option: --bundle <name> (or use --update)');
    return 1;
  }
  if (!harness) {
    console.error('Missing required option: --harness <name>');
    return 1;
  }
  if (!HARNESSES.includes(harness)) {
    console.error(`Unknown harness: ${harness}. Supported: ${HARNESSES.join(', ')}`);
    return 1;
  }

  // Skip if already installed and current
  if (isCurrent(bundleName, harness, repoRoot)) {
    console.log(`✓ ${bundleName} → ${harness}: already current, skipping.`);
    return 0;
  }

  return installBundle(bundleName, harness, repoRoot);
}
