// ------------------------------
// install-check.js
//
// Author: Starvoxel AI Agent - 2026-10-26
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * `aif install --scope project --check` — reports where a project's committed
 * install differs from what the current ai-foundation would write. It
 * reinstalls the bundles named in each project manifest into a temporary
 * project and compares the files byte for byte, so adapter changes are caught
 * too (source hashes alone miss them). MCP settings files are shared with
 * entries the project adds itself, so only aif's own server entries in them
 * are compared. Reports only: always exits 0.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HARNESSES } from '../constants.js';
import { hashContent } from '../file-utils.js';
import { manifestPath, readManifest, toStoredPath } from '../manifest.js';
import { manifestLocation } from '../scope.js';
import { adapters, installBundle, installContext, withScope } from './install.js';

/**
 * @typedef {object} DriftReport
 * @property {string[]} changed - Committed file differs from a fresh install
 * @property {string[]} missing - A fresh install writes it; it is not committed
 * @property {string[]} retired - Committed and recorded, but a fresh install no longer writes it
 */

/**
 * Compare a fresh install against the project. Pure.
 * @param {Record<string, string>} fresh - Project-relative path → content hash of a fresh install
 * @param {Record<string, string|null>} onDisk - Same paths (plus `recorded`) → hash in the project, or null if absent
 * @param {string[]} recorded - Paths the committed manifest lists
 * @returns {DriftReport}
 */
export function diffInstall(fresh, onDisk, recorded) {
  const changed = [];
  const missing = [];
  for (const [path, hash] of Object.entries(fresh)) {
    const actual = onDisk[path] ?? null;
    if (actual === null) missing.push(path);
    else if (actual !== hash) changed.push(path);
  }
  const retired = recorded.filter((path) => !(path in fresh) && (onDisk[path] ?? null) !== null);
  return { changed: changed.sort(), missing: missing.sort(), retired: retired.sort() };
}

/**
 * Canonical JSON (sorted object keys), so formatting and key order do not count as drift. Pure.
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Compare aif's own MCP server entries, ignoring entries the project added. Pure.
 * @param {Record<string, unknown>} fresh - Server name → entry a fresh install writes
 * @param {Record<string, unknown>} committed - Server name → entry in the project's settings file
 * @param {string[]} owned - Servers the committed manifest records as installed by aif
 * @param {string} label - Settings file path, prefixed to each reported entry
 * @returns {DriftReport}
 */
export function diffMcpServers(fresh, committed, owned, label) {
  const changed = [];
  const missing = [];
  for (const [name, entry] of Object.entries(fresh)) {
    if (!Object.hasOwn(committed, name)) missing.push(`${label}#${name}`);
    else if (canonicalJson(committed[name]) !== canonicalJson(entry))
      changed.push(`${label}#${name}`);
  }
  const retired = owned
    .filter((name) => !Object.hasOwn(fresh, name) && Object.hasOwn(committed, name))
    .map((name) => `${label}#${name}`);
  return { changed: changed.sort(), missing: missing.sort(), retired: retired.sort() };
}

/**
 * The `mcpServers` object of an MCP settings file, or {} when the file is absent or malformed.
 * @param {string} file
 * @returns {Record<string, unknown>}
 */
function readMcpServers(file) {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const servers = parsed && typeof parsed === 'object' ? parsed.mcpServers : null;
    return servers && typeof servers === 'object' && !Array.isArray(servers) ? servers : {};
  } catch (err) {
    console.error(`  ! ${file} is not valid JSON (${err.message}); its servers count as missing`);
    return {};
  }
}

/**
 * Every file a manifest records, project-relative, plus the manifest itself.
 * @param {import('../manifest.js').ManifestData} manifest - Absolute paths
 * @param {string} manifestDir
 * @param {string} root - Project root the paths are relative to
 * @returns {string[]}
 */
function recordedPaths(manifest, manifestDir, root) {
  const paths = [toStoredPath(manifestPath(manifestDir), root)];
  for (const section of [manifest.bundles, manifest.servers, manifest.hooks]) {
    for (const entry of Object.values(section)) {
      for (const f of entry.files ?? []) paths.push(toStoredPath(f.path, root));
    }
  }
  return [...new Set(paths)];
}

/**
 * Hash each project-relative path under `root`, null when absent.
 * @param {string[]} paths
 * @param {string} root
 * @returns {Record<string, string|null>}
 */
function hashFiles(paths, root) {
  return Object.fromEntries(
    paths.map((p) => {
      const abs = join(root, ...p.split('/'));
      return [p, existsSync(abs) ? hashContent(readFileSync(abs)) : null];
    }),
  );
}

/**
 * Reinstall `bundles` into a temporary project, with progress output muted.
 * @param {string[]} bundles
 * @param {string} harness
 * @param {string} repoRoot
 * @param {string} tempRoot
 * @returns {number} Number of bundles that failed to install
 */
function freshInstall(bundles, harness, repoRoot, tempRoot) {
  const ctx = installContext(harness, 'project', repoRoot, tempRoot);
  const log = console.log;
  console.log = () => {};
  try {
    return withScope(harness, 'project', tempRoot, () =>
      bundles.reduce((failed, b) => failed + (installBundle(b, ctx) === 0 ? 0 : 1), 0),
    );
  } finally {
    console.log = log;
  }
}

/**
 * Check one harness's project install.
 * @param {string} harness
 * @param {string} repoRoot
 * @param {string} projectRoot
 * @returns {{ bundles: string[], report: DriftReport|null }}
 */
function checkHarness(harness, repoRoot, projectRoot) {
  const location = manifestLocation('project', harness, repoRoot, projectRoot);
  const committed = readManifest(location.dir, location.base);
  const bundles = Object.keys(committed.bundles)
    .filter((key) => key.endsWith(`_${harness}`))
    .map((key) => key.slice(0, -`_${harness}`.length));
  if (bundles.length === 0) return { bundles, report: null };

  const tempRoot = mkdtempSync(join(tmpdir(), 'aif-check-'));
  try {
    const failed = freshInstall(bundles, harness, repoRoot, tempRoot);
    if (failed > 0) console.error(`  ! ${failed} bundle(s) failed to reinstall for the check`);
    const freshLocation = manifestLocation('project', harness, repoRoot, tempRoot);
    const freshManifest = readManifest(freshLocation.dir, tempRoot);
    // The MCP settings file is compared by entry below, never byte for byte.
    const mcpFile = toStoredPath(adapters[harness].projectTargets(tempRoot).mcpSettings, tempRoot);
    const notMcp = (/** @type {string} */ p) => p !== mcpFile;
    const freshPaths = recordedPaths(freshManifest, freshLocation.dir, tempRoot).filter(notMcp);
    const fresh = /** @type {Record<string, string>} */ (hashFiles(freshPaths, tempRoot));
    const recorded = recordedPaths(committed, location.dir, projectRoot).filter(notMcp);
    const onDisk = hashFiles([...new Set([...freshPaths, ...recorded])], projectRoot);
    const files = diffInstall(fresh, onDisk, recorded);

    const owned = Object.keys(committed.servers)
      .filter((key) => key.endsWith(`_${harness}`))
      .map((key) => key.slice(0, -`_${harness}`.length));
    const mcp = diffMcpServers(
      readMcpServers(join(tempRoot, ...mcpFile.split('/'))),
      readMcpServers(join(projectRoot, ...mcpFile.split('/'))),
      owned,
      mcpFile,
    );
    const report = {
      changed: [...files.changed, ...mcp.changed],
      missing: [...files.missing, ...mcp.missing],
      retired: [...files.retired, ...mcp.retired],
    };
    return { bundles, report };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Run the drift check for every harness with a project install.
 * @param {string} repoRoot - ai-foundation root
 * @param {string} projectRoot
 * @returns {number} Always 0: drift is reported, never fatal
 */
export function runCheck(repoRoot, projectRoot) {
  let checked = 0;
  for (const harness of HARNESSES) {
    const { bundles, report } = checkHarness(harness, repoRoot, projectRoot);
    if (!report) continue;
    checked++;
    const drift = [
      ...report.changed.map((p) => `changed: ${p}`),
      ...report.missing.map((p) => `missing: ${p}`),
      ...report.retired.map((p) => `retired: ${p}`),
    ];
    if (drift.length === 0) {
      console.log(`✓ ${harness} (${bundles.join(', ')}): project install is current`);
      continue;
    }
    console.log(`⚠ ${harness} (${bundles.join(', ')}): ${drift.length} file(s) drifted`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      // Surfaces as a warning annotation on the run without failing it.
      console.log(`::warning::${harness} project install drifted (${drift.length} file(s))`);
    }
    for (const line of drift) console.log(`    ${line}`);
    console.log(
      `    Run \`aif install --scope project --update\` and commit the result to refresh it.`,
    );
  }
  if (checked === 0) console.log('No project-scope install found.');
  return 0;
}
