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

import { readManifest, getSectionEntry } from '../manifest.js';
import { HARNESSES, manifestKey } from '../constants.js';
import { computeResourceHashes } from '../source-hashes/io.js';
import { isFreshnessCurrent } from '../source-hashes/pure.js';
import { manifestLocation, parseScope, ScopeError } from '../scope.js';
import { runCheck } from './install-check.js';
import { installBundle, installContext, readCtxManifest, withScope } from './install-core.js';

/**
 * Check if an installed bundle is current: its own sources are unchanged,
 * and every shared server/hook resource it depends on is also unchanged.
 * Project scope always reinstalls instead: the output is committed, so an
 * adapter change (which source hashes do not cover) must reach it.
 * @param {string} bundleName
 * @param {import('./install-core.js').InstallContext} ctx
 * @returns {boolean} true if the bundle and all its dependencies are current
 */
function isCurrent(bundleName, ctx) {
  if (ctx.scope === 'project') return false;
  const { harness, repoRoot } = ctx;
  const manifest = readCtxManifest(ctx);
  const key = manifestKey(bundleName, harness);
  const entry = getSectionEntry(manifest, 'bundles', key);
  if (!entry) return false;

  // A resource that cannot be hashed is not current: reinstalling surfaces the error.
  try {
    if (!isSourceCurrent('bundle', bundleName, entry.sourceHashes, repoRoot)) return false;

    for (const serverName of entry.servers || []) {
      const serverEntry = getSectionEntry(manifest, 'servers', manifestKey(serverName, harness));
      if (!isSourceCurrent('server', serverName, serverEntry && serverEntry.sourceHashes, repoRoot))
        return false;
    }

    for (const hookName of entry.hooks || []) {
      const hookEntry = getSectionEntry(manifest, 'hooks', manifestKey(hookName, harness));
      if (!isSourceCurrent('hook', hookName, hookEntry && hookEntry.sourceHashes, repoRoot))
        return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Whether a resource's recorded source hashes still match its sources on disk.
 * @param {import('../source-hashes/io.js').ResourceKind} kind
 * @param {string} name
 * @param {Record<string, string>|undefined} storedSourceHashes
 * @param {string} repoRoot
 * @returns {boolean}
 */
function isSourceCurrent(kind, name, storedSourceHashes, repoRoot) {
  return isFreshnessCurrent(storedSourceHashes, computeResourceHashes(kind, name, repoRoot));
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
 * @param {import('./install-core.js').InstallContext} ctx
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
  /** @type {Array<{ bundle: string, ctx: import('./install-core.js').InstallContext }>} */
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
