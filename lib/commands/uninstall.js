/**
 * uninstall command — reads a bundle's manifest entry, deletes its own
 * installed files, releases its ownership of any shared server/hook
 * resources (only physically removing them once no other bundle still
 * depends on them), and removes the bundle's manifest entry.
 *
 * See docs/architecture/06_runtime.md
 */

import { unlinkSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  readManifest,
  writeManifest,
  getSectionEntry,
  setSectionEntry,
  removeSectionEntry,
  removeOwner,
  splitOwnedPaths,
} from '../manifest.js';
import { HARNESSES, manifestKey } from '../constants.js';
import {
  enterScope as enterKiroScope,
  removeMcpSetting as removeKiroMcpSetting,
  TARGETS as KIRO_TARGETS,
} from '../harnesses/kiro.js';
import {
  enterScope as enterClaudeScope,
  removeMcpSetting as removeClaudeMcpSetting,
  TARGETS as CLAUDE_TARGETS,
} from '../harnesses/claude.js';
import { manifestLocation, parseScope, ScopeError } from '../scope.js';

const enterScope = {
  kiro: enterKiroScope,
  claude: enterClaudeScope,
};

const mcpCleanup = {
  kiro: removeKiroMcpSetting,
  claude: removeClaudeMcpSetting,
};

const serverTargetsMap = {
  kiro: KIRO_TARGETS,
  claude: CLAUDE_TARGETS,
};

// Hook resources are Claude-only today (Kiro embeds blocked_commands
// directly into each agent's own JSON — no shared external asset).
const hookTargetsMap = {
  claude: CLAUDE_TARGETS,
};

/**
 * Release a bundle's dependency on a shared resource (server or hook).
 * Removes the bundle from the resource's `installedBy` list. If no owners
 * remain, physically removes the resource's target directory (and MCP
 * registration, for servers) and deletes its manifest entry. Otherwise the
 * resource stays installed and the manifest entry is updated in place.
 *
 * @param {object} params
 * @param {import('../manifest.js').ManifestData} params.manifest - Current in-memory manifest
 * @param {'servers'|'hooks'} params.section
 * @param {string} params.name - Resource name (server or hook resource name)
 * @param {string} params.harness
 * @param {string} params.bundleName
 * @param {((name: string) => void)|undefined} params.removeMcp - MCP deregistration function, if applicable
 * @param {string|undefined} params.targetDir - Absolute path to the resource's installed directory
 * @param {string} params.label - Human-readable label for log output ("server" or "hook")
 * @returns {import('../manifest.js').ManifestData} Updated manifest
 */
function releaseSharedResource({
  manifest,
  section,
  name,
  harness,
  bundleName,
  removeMcp,
  targetDir,
  label,
}) {
  const key = manifestKey(name, harness);
  const resourceEntry = getSectionEntry(manifest, section, key);
  if (!resourceEntry) {
    // Nothing recorded (e.g. it never installed successfully) — nothing to release.
    return manifest;
  }

  const installedBy = removeOwner(resourceEntry.installedBy, bundleName);

  if (installedBy.length > 0) {
    console.log(`  ↷ ${label} kept: ${name} (still used by ${installedBy.join(', ')})`);
    return setSectionEntry(manifest, section, key, { ...resourceEntry, installedBy });
  }

  if (removeMcp) {
    removeMcp(name);
  }
  if (targetDir && existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  console.log(`  ✓ ${label} removed: ${name}`);
  return removeSectionEntry(manifest, section, key).manifest;
}

/**
 * Release a bundle's dependency on a named server or hook resource,
 * resolving the harness-specific target directory and MCP cleanup.
 * @param {import('../manifest.js').ManifestData} manifest
 * @param {'servers'|'hooks'} section
 * @param {string} name
 * @param {string} harness
 * @param {string} bundleName
 * @returns {import('../manifest.js').ManifestData} Updated manifest
 */
export function releaseNamedResource(manifest, section, name, harness, bundleName) {
  const isServer = section === 'servers';
  const targets = (isServer ? serverTargetsMap : hookTargetsMap)[harness];
  return releaseSharedResource({
    manifest,
    section,
    name,
    harness,
    bundleName,
    removeMcp: isServer ? mcpCleanup[harness] : undefined,
    targetDir: targets && join(isServer ? targets.servers : targets.scripts, name),
    label: isServer ? 'server' : 'hook',
  });
}

/**
 * Run the uninstall command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot - ai-foundation root (global manifest)
 * @param {string} [projectRoot] - Project a project-scope install lives in
 * @returns {number} exit code
 */
export function runUninstall(parsed, repoRoot, projectRoot = process.cwd()) {
  const bundleName = parsed.args.bundle;
  const harness = parsed.args.harness;
  let scope;
  try {
    scope = parseScope(parsed.args.scope);
  } catch (err) {
    if (!(err instanceof ScopeError)) throw err;
    console.error(err.message);
    return 1;
  }

  if (typeof bundleName !== 'string' || !bundleName) {
    console.error('Missing required option: --bundle <name>');
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

  const restore = enterScope[harness](scope, projectRoot);
  try {
    return uninstallBundle(
      bundleName,
      harness,
      manifestLocation(scope, harness, repoRoot, projectRoot),
    );
  } finally {
    restore();
  }
}

/**
 * Uninstall one bundle, with the adapter already pointed at its scope.
 * @param {string} bundleName
 * @param {string} harness
 * @param {import('../scope.js').ManifestLocation} location
 * @returns {number} exit code
 */
function uninstallBundle(bundleName, harness, location) {
  let manifest = readManifest(location.dir, location.base);
  const bundleKey = manifestKey(bundleName, harness);
  const entry = getSectionEntry(manifest, 'bundles', bundleKey);

  if (!entry) {
    console.error(`Bundle "${bundleName}" is not installed for ${harness}.`);
    return 1;
  }

  let removed = 0;
  let missing = 0;

  // Files another installed bundle also lists (e.g. standards) stay in place.
  const { removable, shared } = splitOwnedPaths(manifest, bundleKey);
  for (const path of removable) {
    if (existsSync(path)) {
      unlinkSync(path);
      removed++;
    } else {
      missing++;
    }
  }

  for (const serverName of entry.servers || []) {
    manifest = releaseNamedResource(manifest, 'servers', serverName, harness, bundleName);
  }

  for (const hookName of entry.hooks || []) {
    manifest = releaseNamedResource(manifest, 'hooks', hookName, harness, bundleName);
  }

  manifest = removeSectionEntry(manifest, 'bundles', bundleKey).manifest;
  writeManifest(location.dir, manifest, location.base);

  console.log(
    `Uninstalled bundle "${bundleName}" from ${harness} at ${location.base ? `project scope (${location.dir})` : 'global scope'} (${removed} files removed${missing > 0 ? `, ${missing} already missing` : ''}${shared.length > 0 ? `, ${shared.length} kept for other bundles` : ''})`,
  );
  return 0;
}
