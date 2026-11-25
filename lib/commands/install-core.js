// ------------------------------
// install-core.js
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * The install building blocks shared by `install` and `install-check`: the harness adapters,
 * the per-scope install context, and installing one bundle. Lives apart from install.js so
 * install.js and install-check.js do not import each other.
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
import { manifestKey } from '../constants.js';
import { computeResourceHashes } from '../source-hashes/io.js';
import { manifestLocation } from '../scope.js';

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
 * @property {import('../harnesses/base.js').Log} log - Where progress lines go; a no-op when the context is quiet
 */

/**
 * Build the install context for one harness and scope.
 * @param {string} harness
 * @param {'global'|'project'} scope
 * @param {string} repoRoot
 * @param {string} projectRoot
 * @param {{ quiet?: boolean }} [options] - `quiet` drops progress lines (errors still print)
 * @returns {InstallContext}
 */
export function installContext(harness, scope, repoRoot, projectRoot, { quiet = false } = {}) {
  return {
    harness,
    scope,
    repoRoot,
    location: manifestLocation(scope, harness, repoRoot, projectRoot),
    log: quiet ? () => {} : (message) => console.log(message),
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
export function readCtxManifest(ctx) {
  return readManifest(ctx.location.dir, ctx.location.base);
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
 * @param {import('../harnesses/base.js').Log} log - Where progress lines go
 * @returns {import('../manifest.js').ManifestData} Manifest with released resources applied
 */
function pruneRetired(
  manifest,
  bundleKey,
  bundleName,
  harness,
  files,
  resolved,
  agentsResult,
  log,
) {
  for (const path of orphanedPaths(manifest, bundleKey, files)) {
    try {
      if (existsSync(path)) unlinkSync(path);
      log(`  ✗ retired: ${path}`);
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
  const { harness, repoRoot, log } = ctx;
  let resolved;
  try {
    resolved = resolveBundle(bundleName, repoRoot);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const adapter = adapters[harness];

  // Bundle-owned components (all available standards; loading is gated by resolution rules)
  const standardsFiles = adapter.installStandards(listStandards(repoRoot), repoRoot, log);
  // { files, sharedResources, dropped } — throws, before writing any agent, when an agent
  // names an unknown tool.
  let agentsResult;
  try {
    agentsResult = adapter.installAgents(resolved.agents, repoRoot, log);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    return 1;
  }
  const steeringFiles = adapter.installSteering(resolved.steering, repoRoot, log);
  const skillsFiles = adapter.installSkills(resolved.skills, repoRoot, log);
  const files = [...standardsFiles, ...agentsResult.files, ...steeringFiles, ...skillsFiles];

  // Shared resources — installed regardless of whether another bundle already
  // owns them (idempotent), then registered as depended-on by this bundle.
  const { installed: serverResults, failed: failedServers } = adapter.installServers(
    resolved.servers,
    repoRoot,
    log,
  );
  const sharedResourceResults = adapter.installSharedResources(
    agentsResult.sharedResources,
    repoRoot,
    log,
  ); // [{ name, files }]

  let manifest = readCtxManifest(ctx);
  const bundleKey = manifestKey(bundleName, harness);
  // A skipped server (a stdio server at project scope) is not aif's to own, uninstall or check, so
  // it is left out. A failed one stays in the bundle's list with no server entry, so the bundle
  // does not count as current and a later fix to the server is picked up.
  const installedServers = serverResults.map((r) => r.name);
  const bundleServers = [...installedServers, ...failedServers];
  manifest = pruneRetired(
    manifest,
    bundleKey,
    bundleName,
    harness,
    files,
    { servers: bundleServers },
    agentsResult,
    log,
  );

  for (const { name, files: serverFiles } of serverResults) {
    const serverKey = manifestKey(name, harness);
    const existing = getSectionEntry(manifest, 'servers', serverKey) || {
      files: [],
      installedBy: [],
    };
    const entry = {
      files: serverFiles,
      installedBy: addOwner(existing.installedBy, bundleName),
      sourceHashes: computeResourceHashes('server', name, repoRoot),
    };
    manifest = setSectionEntry(manifest, 'servers', serverKey, entry);
  }

  for (const { name, files: hookFiles } of sharedResourceResults) {
    const hookKey = manifestKey(name, harness);
    const existing = getSectionEntry(manifest, 'hooks', hookKey) || { files: [], installedBy: [] };
    const entry = {
      files: hookFiles,
      installedBy: addOwner(existing.installedBy, bundleName),
      sourceHashes: computeResourceHashes('hook', name, repoRoot),
    };
    manifest = setSectionEntry(manifest, 'hooks', hookKey, entry);
  }

  // Record the bundle itself (include source hashes for freshness detection)
  const bundleEntry = {
    version: resolved.version,
    files,
    servers: bundleServers,
    hooks: agentsResult.sharedResources,
    sourceHashes: computeResourceHashes('bundle', bundleName, repoRoot),
  };
  manifest = setSectionEntry(manifest, 'bundles', bundleKey, bundleEntry);

  writeManifest(ctx.location.dir, manifest, ctx.location.base);

  const totalFiles =
    files.length +
    serverResults.reduce((n, s) => n + s.files.length, 0) +
    sharedResourceResults.reduce((n, s) => n + s.files.length, 0);
  log(
    `\nInstalled bundle "${bundleName}" to ${harness} at ${ctx.scope} scope${ctx.scope === 'project' ? ` (${ctx.location.dir})` : ''} (${totalFiles} files)`,
  );
  return 0;
}
