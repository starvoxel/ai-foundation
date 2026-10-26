// ------------------------------
// install.js
//
// Author: Starvoxel AI Agent - 2026-10-02
// Plan: AIF-010
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * install command — resolves a bundle and delegates installation to the
 * harness adapter. Records results in the manifest.
 *
 * Shared resources (MCP servers, harness-level hook scripts) are tracked in
 * their own manifest sections with an `installedBy` list, independent of any
 * single bundle's lifecycle — see lib/manifest.js and
 * docs/architecture/06_runtime.md
 *
 * Modes:
 *   aif install --bundle <name> --harness <name>       — install a specific bundle
 *   aif install --bundle <a>,<b>,... --harness <name>   — install multiple bundles to the same harness
 *   aif install --update                                — update all installed bundles that are stale
 *
 * `--scope global|project` (default global) picks where files go; see
 * lib/scope.js. `--check` (project scope) reports drift without writing, and
 * `--skip-project` (global scope) skips bundles the project already installs.
 */

import { existsSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import { resolveBundle, listStandards } from '../resolver.js';
import * as kiro from '../harnesses/kiro.js';
import * as claude from '../harnesses/claude.js';
import {
  readManifest,
  writeManifest,
  getSectionEntry,
  setSectionEntry,
  addOwner,
  orphanedPaths,
} from '../manifest.js';
import { releaseNamedResource } from './uninstall.js';
import { HARNESSES, manifestKey } from '../constants.js';
import { readSnapshot, readServerSnapshot, readHookSnapshot } from './snapshot.js';
import { isFreshnessCurrent } from '../snapshot/pure.js';
import { manifestLocation, parseScope, ScopeError } from '../scope.js';
import { runCheck } from './install-check.js';

export const adapters = {
  kiro,
  claude,
};

/**
 * @typedef {object} InstallContext
 * @property {string} harness
 * @property {'global'|'project'} scope
 * @property {string} repoRoot - ai-foundation root (component sources)
 * @property {import('../scope.js').ManifestLocation} location - Where this scope's manifest lives
 */

/**
 * Build the install context for one harness and scope.
 * @param {string} harness
 * @param {'global'|'project'} scope
 * @param {string} repoRoot
 * @param {string} projectRoot
 * @returns {InstallContext}
 */
export function installContext(harness, scope, repoRoot, projectRoot) {
  return {
    harness,
    scope,
    repoRoot,
    location: manifestLocation(scope, harness, repoRoot, projectRoot),
  };
}

/**
 * Run `fn` with the harness adapter pointed at the given scope, restoring it after.
 * @template T
 * @param {string} harness
 * @param {'global'|'project'} scope
 * @param {string} projectRoot
 * @param {() => T} fn
 * @returns {T}
 */
export function withScope(harness, scope, projectRoot, fn) {
  const restore = adapters[harness].enterScope(scope, projectRoot);
  try {
    return fn();
  } finally {
    restore();
  }
}

/**
 * @param {InstallContext} ctx
 * @returns {import('../manifest.js').ManifestData}
 */
function readCtxManifest(ctx) {
  return readManifest(ctx.location.dir, ctx.location.base);
}

/**
 * Check if an installed bundle is current: its own sources are unchanged,
 * and every shared server/hook resource it depends on is also unchanged.
 * Project scope always reinstalls instead: the output is committed, so an
 * adapter change (which source snapshots do not cover) must reach it.
 * @param {string} bundleName
 * @param {InstallContext} ctx
 * @returns {boolean} true if the bundle and all its dependencies are current
 */
function isCurrent(bundleName, ctx) {
  if (ctx.scope === 'project') return false;
  const { harness, repoRoot } = ctx;
  const manifest = readCtxManifest(ctx);
  const key = manifestKey(bundleName, harness);
  const entry = getSectionEntry(manifest, 'bundles', key);
  if (!entry) return false;

  if (!isFreshnessCurrent(entry.sourceHashes, readSnapshot(bundleName, repoRoot))) {
    return false;
  }

  for (const serverName of entry.servers || []) {
    const serverEntry = getSectionEntry(manifest, 'servers', manifestKey(serverName, harness));
    const stored = serverEntry && serverEntry.sourceHashes;
    if (!isFreshnessCurrent(stored, readServerSnapshot(serverName, repoRoot))) return false;
  }

  for (const hookName of entry.hooks || []) {
    const hookEntry = getSectionEntry(manifest, 'hooks', manifestKey(hookName, harness));
    const stored = hookEntry && hookEntry.sourceHashes;
    if (!isFreshnessCurrent(stored, readHookSnapshot(hookName, repoRoot))) return false;
  }

  return true;
}

const HARNESS_ROOT_DIRS = new Set(['agents', 'skills', 'rules', 'steering', 'standards']);

/**
 * Remove what a previous install of this bundle wrote that the new install no
 * longer does (a retired agent, skill or rule), release servers and hooks it no
 * longer uses, and drop directories that end up empty.
 * @param {import('../manifest.js').ManifestData} manifest - Manifest before the new entry is recorded
 * @param {string} bundleKey - "{bundle}_{harness}"
 * @param {string} bundleName
 * @param {string} harness
 * @param {Array<{path: string}>} files - Files the install just wrote
 * @param {{ servers: string[] }} resolved - The resolved bundle
 * @param {{ sharedResources: string[] }} agentsResult - Result of the agent install
 * @returns {import('../manifest.js').ManifestData} Manifest with released resources applied
 */
function pruneRetired(manifest, bundleKey, bundleName, harness, files, resolved, agentsResult) {
  for (const path of orphanedPaths(manifest, bundleKey, files)) {
    try {
      if (existsSync(path)) unlinkSync(path);
      console.log(`  ✗ retired: ${path}`);
    } catch (err) {
      console.error(`  ! could not remove retired ${path}: ${err.message}`);
      continue;
    }
    let dir = dirname(path);
    for (let depth = 0; depth < 3; depth++) {
      if (HARNESS_ROOT_DIRS.has(basename(dir)) || !existsSync(dir) || readdirSync(dir).length > 0)
        break;
      rmdirSync(dir);
      dir = dirname(dir);
    }
  }

  const previous = manifest.bundles[bundleKey] ?? {};
  const keep = { servers: resolved.servers, hooks: agentsResult.sharedResources };
  for (const section of /** @type {const} */ (['servers', 'hooks'])) {
    for (const name of previous[section] ?? []) {
      if (!keep[section].includes(name)) {
        manifest = releaseNamedResource(manifest, section, name, harness, bundleName);
      }
    }
  }
  return manifest;
}

/**
 * Install a single bundle to a harness, in the adapter's current scope.
 * @param {string} bundleName
 * @param {InstallContext} ctx
 * @returns {number} exit code
 */
export function installBundle(bundleName, ctx) {
  const { harness, repoRoot } = ctx;
  let resolved;
  try {
    resolved = resolveBundle(bundleName, repoRoot);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const adapter = adapters[harness];

  // Bundle-owned components (all available standards; loading is gated by resolution rules)
  const standardsFiles = adapter.installStandards(listStandards(repoRoot), repoRoot);
  // { files, sharedResources, dropped } — throws, before writing any agent, when an agent
  // names an unknown tool.
  let agentsResult;
  try {
    agentsResult = adapter.installAgents(resolved.agents, repoRoot);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    return 1;
  }
  const steeringFiles = adapter.installSteering(resolved.steering, repoRoot);
  const skillsFiles = adapter.installSkills(resolved.skills, repoRoot);
  const files = [...standardsFiles, ...agentsResult.files, ...steeringFiles, ...skillsFiles];

  // Shared resources — installed regardless of whether another bundle already
  // owns them (idempotent), then registered as depended-on by this bundle.
  const serverResults = adapter.installServers(resolved.servers, repoRoot); // [{ name, files }]
  const sharedResourceResults = adapter.installSharedResources(
    agentsResult.sharedResources,
    repoRoot,
  ); // [{ name, files }]

  let manifest = readCtxManifest(ctx);
  const bundleKey = manifestKey(bundleName, harness);
  manifest = pruneRetired(manifest, bundleKey, bundleName, harness, files, resolved, agentsResult);

  for (const { name, files: serverFiles } of serverResults) {
    const serverKey = manifestKey(name, harness);
    const existing = getSectionEntry(manifest, 'servers', serverKey) || {
      files: [],
      installedBy: [],
    };
    const serverSnapshot = readServerSnapshot(name, repoRoot);
    const entry = { files: serverFiles, installedBy: addOwner(existing.installedBy, bundleName) };
    if (serverSnapshot && serverSnapshot.sources) {
      entry.sourceHashes = serverSnapshot.sources;
    }
    manifest = setSectionEntry(manifest, 'servers', serverKey, entry);
  }

  for (const { name, files: hookFiles } of sharedResourceResults) {
    const hookKey = manifestKey(name, harness);
    const existing = getSectionEntry(manifest, 'hooks', hookKey) || { files: [], installedBy: [] };
    const hookSnapshot = readHookSnapshot(name, repoRoot);
    const entry = { files: hookFiles, installedBy: addOwner(existing.installedBy, bundleName) };
    if (hookSnapshot && hookSnapshot.sources) {
      entry.sourceHashes = hookSnapshot.sources;
    }
    manifest = setSectionEntry(manifest, 'hooks', hookKey, entry);
  }

  // Record the bundle itself (include snapshot hashes for freshness detection)
  const bundleSnapshot = readSnapshot(bundleName, repoRoot);
  const bundleEntry = {
    version: resolved.version,
    files,
    servers: resolved.servers,
    hooks: agentsResult.sharedResources,
  };
  if (bundleSnapshot && bundleSnapshot.sources) {
    bundleEntry.sourceHashes = bundleSnapshot.sources;
  }
  manifest = setSectionEntry(manifest, 'bundles', bundleKey, bundleEntry);

  writeManifest(ctx.location.dir, manifest, ctx.location.base);

  const totalFiles =
    files.length +
    serverResults.reduce((n, s) => n + s.files.length, 0) +
    sharedResourceResults.reduce((n, s) => n + s.files.length, 0);
  console.log(
    `\nInstalled bundle "${bundleName}" to ${harness} at ${ctx.scope} scope (${totalFiles} files)`,
  );
  return 0;
}

/**
 * Parse a possibly comma-separated `--bundle` value into unique, trimmed
 * bundle names. "a, b,,a" -> ["a", "b"].
 * @param {string} bundleArg
 * @returns {string[]}
 */
function parseBundleNames(bundleArg) {
  return [
    ...new Set(
      bundleArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Bundles to skip because the project already installs them at project
 * scope, so a global install of the same bundle would load it twice. Pure.
 * @param {string[]} bundleNames
 * @param {import('../manifest.js').ManifestData} projectManifest
 * @param {string} harness
 * @returns {{ keep: string[], skip: string[] }}
 */
export function splitProjectInstalled(bundleNames, projectManifest, harness) {
  const installed = (name) => Boolean(projectManifest.bundles[manifestKey(name, harness)]);
  return {
    keep: bundleNames.filter((name) => !installed(name)),
    skip: bundleNames.filter(installed),
  };
}

/**
 * Install one or more bundles to a harness, skipping any that are already
 * current. The single-bundle case keeps its existing terse output (no
 * summary line); multiple bundles get the same aggregate summary as
 * `--update`, and one bundle's failure doesn't stop the rest from being
 * attempted.
 * @param {string[]} bundleNames
 * @param {InstallContext} ctx
 * @returns {number} exit code
 */
function installBundles(bundleNames, ctx) {
  const { harness } = ctx;
  if (bundleNames.length === 1) {
    const [bundleName] = bundleNames;
    if (isCurrent(bundleName, ctx)) {
      console.log(`✓ ${bundleName} → ${harness}: already current, skipping.`);
      return 0;
    }
    return installBundle(bundleName, ctx);
  }

  let installed = 0;
  let skipped = 0;
  let failed = 0;

  for (const bundleName of bundleNames) {
    if (isCurrent(bundleName, ctx)) {
      console.log(`✓ ${bundleName} → ${harness}: already current, skipping.`);
      skipped++;
      continue;
    }

    const code = installBundle(bundleName, ctx);
    if (code === 0) {
      installed++;
    } else {
      failed++;
    }
  }

  console.log(
    `\n${installed} installed, ${skipped} current${failed > 0 ? `, ${failed} failed` : ''}.`,
  );
  return failed > 0 ? 1 : 0;
}

/**
 * Update all installed bundles that are stale. Global scope reads the one
 * global manifest; project scope reads each harness's project manifest.
 * @param {'global'|'project'} scope
 * @param {string} repoRoot
 * @param {string} projectRoot
 * @returns {number} exit code
 */
function runUpdate(scope, repoRoot, projectRoot) {
  /** @type {Array<{ bundle: string, ctx: InstallContext }>} */
  const targets = [];
  // The global manifest is shared by every harness, so read it once.
  const harnesses = scope === 'project' ? HARNESSES : [HARNESSES[0]];
  for (const h of harnesses) {
    const location = manifestLocation(scope, h, repoRoot, projectRoot);
    const manifest = readManifest(location.dir, location.base);
    for (const key of Object.keys(manifest.bundles)) {
      const [bundle, harness] = key.split('_');
      targets.push({ bundle, ctx: installContext(harness, scope, repoRoot, projectRoot) });
    }
  }

  if (targets.length === 0) {
    console.log(
      `Nothing installed at ${scope} scope. Use \`aif install --bundle <name> --harness <name>\` first.`,
    );
    return 0;
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { bundle, ctx } of targets) {
    if (isCurrent(bundle, ctx)) {
      console.log(`✓ ${bundle} → ${ctx.harness}: already current`);
      skipped++;
      continue;
    }

    console.log(`↻ ${bundle} → ${ctx.harness}: updating...`);
    const code = withScope(ctx.harness, scope, projectRoot, () => installBundle(bundle, ctx));
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
 * @param {string} repoRoot - ai-foundation root (component sources, global manifest)
 * @param {string} [projectRoot] - Project a project-scope install writes into
 * @returns {number} exit code
 */
export function runInstall(parsed, repoRoot, projectRoot = process.cwd()) {
  let scope;
  try {
    scope = parseScope(parsed.args.scope);
  } catch (err) {
    if (!(err instanceof ScopeError)) throw err;
    console.error(err.message);
    return 1;
  }

  if (parsed.args.check) {
    if (scope !== 'project') {
      console.error('--check needs --scope project (it compares committed project files).');
      return 1;
    }
    return runCheck(repoRoot, projectRoot);
  }

  // Update mode: refresh all stale installed bundles
  if (parsed.args.update) {
    return runUpdate(scope, repoRoot, projectRoot);
  }

  const bundleArg = parsed.args.bundle;
  const harness = parsed.args.harness;

  if (typeof bundleArg !== 'string' || !bundleArg) {
    console.error('Missing required option: --bundle <name>[,<name>...] (or use --update)');
    return 1;
  }
  if (typeof harness !== 'string' || !harness) {
    console.error('Missing required option: --harness <name>');
    return 1;
  }
  if (!HARNESSES.includes(harness)) {
    console.error(`Unknown harness: ${harness}. Supported: ${HARNESSES.join(', ')}`);
    return 1;
  }

  let bundleNames = parseBundleNames(bundleArg);
  if (bundleNames.length === 0) {
    console.error('Missing required option: --bundle <name>[,<name>...] (or use --update)');
    return 1;
  }

  if (parsed.args['skip-project']) {
    if (scope !== 'global') {
      console.error('--skip-project applies to --scope global only.');
      return 1;
    }
    const location = manifestLocation('project', harness, repoRoot, projectRoot);
    const { keep, skip } = splitProjectInstalled(
      bundleNames,
      readManifest(location.dir, location.base),
      harness,
    );
    for (const name of skip) {
      console.log(`↷ ${name} → ${harness}: installed at project scope, skipping.`);
    }
    if (keep.length === 0) return 0;
    bundleNames = keep;
  }

  const ctx = installContext(harness, scope, repoRoot, projectRoot);
  return withScope(harness, scope, projectRoot, () => installBundles(bundleNames, ctx));
}
