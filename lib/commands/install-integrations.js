// ------------------------------
// install-integrations.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * `aif install -I <name>` and the integration side of `--update` and `--check`.
 * Project scope only. The decisions are pure and live in `lib/integrations.js`;
 * this module reads templates and project files, writes, and prints one line per
 * file. Plan: aif-project-integrations (Milestone 3).
 *
 * Safety: a target whose path crosses a symlink is refused, so a hostile repository
 * cannot point `.githooks` or `.github` somewhere else and have a write follow it. Files
 * are written with LF line endings.
 */

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import {
  INTEGRATIONS,
  INTEGRATIONS_DIR,
  INTEGRATION_NAMES,
  SNIPPETS,
  carryPins,
  describeDrift,
  isIntegration,
  normalizeEol,
  planFile,
  pinlessHash,
  refreshedByUpdate,
  renderAsset,
} from '../integrations.js';
import { explicitPin, pickLatestTag } from '../release-pin.js';
import { MANIFEST_FILENAME } from '../constants.js';
import { readManifest, setSectionEntry, writeManifest } from '../manifest.js';

/** Stands in for the pin when only the structure of a workflow is compared. */
const COMPARISON_PIN = { sha: '0'.repeat(40), version: 'v0.0.0' };

/** Thrown for a problem the user can fix; its message is printed as is. */
class IntegrationError extends Error {}

/**
 * @param {string} aifRoot
 * @param {string} source - Template path relative to the ai-foundation root
 * @returns {string} Template text with LF line endings
 */
function readTemplate(aifRoot, source) {
  return normalizeEol(readFileSync(join(aifRoot, ...source.split('/')), 'utf8'));
}

/**
 * @param {string} path
 * @returns {string|null} Content, or null when the file does not exist
 */
function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Whether two paths name the same directory.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameDirectory(a, b) {
  /** @param {string} p */
  const canonical = (p) => {
    try {
      return realpathSync(resolve(p));
    } catch {
      return resolve(p);
    }
  };
  const [left, right] = [canonical(a), canonical(b)];
  // Windows paths are case-insensitive and git may report a different drive-letter case.
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/**
 * The pin to write into workflows: explicit flags, else the latest release tag
 * in the ai-foundation checkout. The checkout must be a git repository of its own: a copy
 * without a `.git` would otherwise read the tags of whatever repository contains it.
 * @param {string} aifRoot
 * @param {Record<string, string|boolean>} args
 * @param {(root: string, gitArgs: string[]) => string} [git] - Runs git in the checkout
 * @returns {{ sha: string, version: string }}
 * @throws {Error} when neither flags nor a release tag give a pin
 */
export function resolvePin(aifRoot, args, git = runGit) {
  if (args.pin !== undefined || args['pin-version'] !== undefined) {
    return explicitPin(args.pin, args['pin-version']);
  }
  const how = 'Pass --pin <sha> --pin-version <vX.Y.Z>.';
  /** @type {string[]} */
  let tags;
  try {
    const top = git(aifRoot, ['rev-parse', '--show-toplevel']).trim();
    if (!sameDirectory(top, aifRoot)) {
      throw new Error(
        `${aifRoot} is not a git checkout of its own (git found ${top}), so its tags are not ai-foundation's.`,
      );
    }
    tags = git(aifRoot, ['tag', '--list']).split('\n');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read release tags from ${aifRoot}: ${reason} ${how}`, {
      cause: err,
    });
  }
  const tag = pickLatestTag(tags);
  if (tag === null) {
    throw new Error(
      `No release tag (vX.Y.Z) in ${aifRoot}, so there is nothing to pin. Fetch tags. ${how}`,
    );
  }
  return { sha: git(aifRoot, ['rev-parse', `${tag}^{commit}`]).trim(), version: tag };
}

/**
 * @param {string} root
 * @param {string[]} gitArgs
 * @returns {string}
 */
function runGit(root, gitArgs) {
  return execFileSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8' });
}

/**
 * Where a target path leaves the project through a symlink, if it does. A component that does
 * not exist yet cannot be a link, so the walk stops there.
 * @param {string} projectRoot
 * @param {string} target - Forward-slash path relative to the project root
 * @returns {string|null} Description of the first symlink on the way, or null
 */
export function symlinkProblem(projectRoot, target) {
  let current = projectRoot;
  for (const part of target.split('/')) {
    current = join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      return null;
    }
    if (stat.isSymbolicLink()) return `${relative(projectRoot, current)} is a symlink`;
  }
  return null;
}

/**
 * @param {string} projectRoot
 * @returns {{ dir: string, base: string }}
 */
function manifestLocation(projectRoot) {
  return { dir: join(projectRoot, INTEGRATIONS_DIR), base: projectRoot };
}

/**
 * Refuse to read or write the manifest through a symlink: `.aif` or `.aif/.installs.yaml` could
 * point out of the project just as a target could.
 * @param {string} projectRoot
 * @throws {IntegrationError}
 */
function assertManifestSafe(projectRoot) {
  const problem = symlinkProblem(projectRoot, `${INTEGRATIONS_DIR}/${MANIFEST_FILENAME}`);
  if (problem) throw new IntegrationError(`${problem}; refused.`);
}

/**
 * Read `.aif/.installs.yaml`, turning a corrupt file into a message the user can act on.
 * @param {string} projectRoot
 * @returns {import('../manifest.js').ManifestData}
 * @throws {IntegrationError}
 */
function loadManifest(projectRoot) {
  const location = manifestLocation(projectRoot);
  assertManifestSafe(projectRoot);
  try {
    return readManifest(location.dir, location.base);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    throw new IntegrationError(
      `${INTEGRATIONS_DIR}/.installs.yaml is unreadable (${reason}). Fix it or remove it, then run aif install -I again.`,
    );
  }
}

/**
 * The recorded entry of an integration, if it is a well-formed one.
 * @param {import('../manifest.js').ManifestData} manifest
 * @param {string} name
 * @returns {Record<string, any>|undefined}
 */
function entryOf(manifest, name) {
  const entry = manifest.integrations[name];
  return entry && typeof entry === 'object' ? entry : undefined;
}

/**
 * Hash recorded for a project file in an integration's manifest entry, if any.
 * @param {Record<string, any>|undefined} entry
 * @param {string} path - Absolute path
 * @returns {string|null}
 */
function recordedHash(entry, path) {
  const file = Array.isArray(entry?.files) ? entry.files.find((f) => f?.path === path) : undefined;
  return file ? file.hash : null;
}

/**
 * @param {string} aifRoot
 * @returns {string}
 */
function aifVersion(aifRoot) {
  return JSON.parse(readFileSync(join(aifRoot, 'package.json'), 'utf8')).version;
}

/**
 * Write a file, creating its directory, with the executable bit when asked.
 * @param {string} path
 * @param {string} content
 * @param {boolean|undefined} executable
 */
function writeProjectFile(path, content, executable) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  if (executable) chmodSync(path, 0o755);
}

/**
 * Give a script back the executable bit it lost, without rewriting it. Used by `-I` only: the
 * daily update must not re-enable a hook someone disabled with `chmod -x`. The bit means nothing
 * on Windows, so nothing is done there.
 * @param {string} path
 * @param {boolean|undefined} executable
 * @returns {boolean} Whether the mode was changed
 */
function repairExecutable(path, executable) {
  if (!executable || process.platform === 'win32' || !existsSync(path)) return false;
  const mode = statSync(path).mode;
  if (mode & 0o100) return false;
  // Like `chmod +x`: add execute only where the file can already be read, never widen access.
  chmodSync(path, mode | ((mode & 0o444) >> 2));
  return true;
}

const MARK = { write: '✓', current: '✓', adopt: '✓', skip: '⚠' };

/**
 * Install the named integrations into the project.
 * @param {object} options
 * @param {string[]} options.names - Integration names, already validated
 * @param {string} options.aifRoot
 * @param {string} options.projectRoot
 * @param {Record<string, string|boolean>} options.args - For --pin, --pin-version and --force
 * @param {(root: string, gitArgs: string[]) => string} [options.git] - Runs git in the checkout
 * @returns {number} Exit code: 0, or 1 when no pin could be resolved, the manifest is
 *   unreadable, or a target was refused
 */
export function installIntegrations({ names, aifRoot, projectRoot, args, git }) {
  const needsPin = names.some((name) => INTEGRATIONS[name].files.some((f) => f.pinned));
  let pin = null;
  if (needsPin) {
    try {
      pin = resolvePin(aifRoot, args, git);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }
  const force = args.force === true;
  let manifest;
  try {
    manifest = loadManifest(projectRoot);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  let refused = false;

  for (const name of names) {
    const integration = INTEGRATIONS[name];
    const entry = entryOf(manifest, name);
    /** @type {Array<{ path: string, hash: string }>} */
    const recorded = [];
    for (const file of integration.files) {
      const path = join(projectRoot, ...file.target.split('/'));
      const before = recordedHash(entry, path);
      const problem = symlinkProblem(projectRoot, file.target);
      if (problem) {
        console.error(`✗ ${name}: ${file.target} (${problem}; refused)`);
        refused = true;
        if (before !== null) recorded.push({ path, hash: before });
        continue;
      }
      const desired = renderAsset(readTemplate(aifRoot, file.source), file.pinned ? pin : null);
      const onDisk = readIfPresent(path);
      const plan = planFile({ desired, onDisk, recorded: before, force });
      // A rewritten workflow keeps the pins Dependabot has set; only new `uses:` lines get ours.
      const content =
        plan.action === 'write' && plan.reason === 'template updated' && onDisk !== null
          ? carryPins(desired, onDisk)
          : desired;
      if (plan.action === 'write') writeProjectFile(path, content, file.executable);
      // Only a file that matches the template is ours to repair; a skipped file is the user's.
      const repaired =
        (plan.action === 'current' || plan.action === 'adopt') &&
        repairExecutable(path, file.executable);
      console.log(
        `${MARK[plan.action]} ${name}: ${file.target} (${plan.reason}${repaired ? '; executable bit restored' : ''})`,
      );
      if (plan.action === 'skip') {
        if (before !== null) recorded.push({ path, hash: before });
        continue;
      }
      recorded.push({
        path,
        hash: pinlessHash(plan.action === 'write' ? content : (onDisk ?? '')),
      });
    }
    // An integration with nothing recorded was not installed; do not claim it was.
    if (recorded.length > 0) {
      manifest = setSectionEntry(manifest, 'integrations', name, {
        version: aifVersion(aifRoot),
        files: recorded,
      });
    }
  }
  const location = manifestLocation(projectRoot);
  if (Object.keys(manifest.integrations).length > 0) {
    try {
      assertManifestSafe(projectRoot);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
    writeManifest(location.dir, manifest, location.base);
  }

  const wanted = [...new Set(names.flatMap((name) => INTEGRATIONS[name].snippets))];
  for (const key of wanted) {
    console.log(`ℹ ${SNIPPETS[key].file} is yours; AIF does not edit it. ${SNIPPETS[key].text}`);
  }
  return refused ? 1 : 0;
}

/**
 * `aif install --update`: refresh the recorded integration files that carry no pins.
 * Pinned workflow files are reported when their template changed; they are
 * refreshed by `aif install -I <name>`. A file recorded as installed but deleted is reported,
 * not restored.
 * @param {string} aifRoot
 * @param {string} projectRoot
 * @returns {number} 0, or 1 when the manifest is unreadable
 */
export function updateIntegrations(aifRoot, projectRoot) {
  let manifest;
  try {
    manifest = loadManifest(projectRoot);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  const location = manifestLocation(projectRoot);
  const installed = Object.keys(manifest.integrations).filter(
    (name) => isIntegration(name) && entryOf(manifest, name),
  );
  let changed = false;
  for (const name of installed) {
    const entry = entryOf(manifest, name);
    /** @type {Array<{ path: string, hash: string }>} */
    const recorded = [];
    let behind = false;
    for (const file of INTEGRATIONS[name].files) {
      const path = join(projectRoot, ...file.target.split('/'));
      const before = recordedHash(entry, path);
      /** Keep what was recorded; the file is not touched. */
      const keep = () => {
        if (before !== null) recorded.push({ path, hash: before });
      };
      const problem = symlinkProblem(projectRoot, file.target);
      if (problem) {
        console.log(`⚠ ${name}: ${file.target} (${problem}; left alone)`);
        behind = true;
        keep();
        continue;
      }
      const desired = renderAsset(
        readTemplate(aifRoot, file.source),
        file.pinned ? COMPARISON_PIN : null,
      );
      const onDisk = readIfPresent(path);
      if (onDisk === null && before !== null) {
        console.log(
          `⚠ ${name}: ${file.target} is missing; run \`aif install -I ${name}\` to restore it`,
        );
        behind = true;
        keep();
        continue;
      }
      if (!refreshedByUpdate(file)) {
        if (describeDrift({ desired, onDisk, recorded: before }) === 'update available') {
          console.log(
            `↷ ${name}: ${file.target} has a newer template; run \`aif install -I ${name}\``,
          );
          behind = true;
        }
        keep();
        continue;
      }
      const plan = planFile({ desired, onDisk, recorded: before });
      if (plan.action === 'skip') {
        console.log(`⚠ ${name}: ${file.target} (${plan.reason}; left alone)`);
        behind = true;
        keep();
        continue;
      }
      if (plan.action === 'write') {
        writeProjectFile(path, desired, file.executable);
        changed = true;
        console.log(`↻ ${name}: ${file.target} (${plan.reason})`);
      }
      recorded.push({
        path,
        hash: pinlessHash(plan.action === 'write' ? desired : (onDisk ?? '')),
      });
    }
    // The recorded version says which release's files these are; it moves only when all are.
    manifest = setSectionEntry(manifest, 'integrations', name, {
      version: behind && entry?.version ? entry.version : aifVersion(aifRoot),
      files: recorded,
    });
  }
  if (installed.length > 0) {
    try {
      assertManifestSafe(projectRoot);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
    writeManifest(location.dir, manifest, location.base);
    if (!changed) console.log('✓ integrations: already current');
  }
  return 0;
}

/**
 * `aif install --check`: report integration drift. Warning only; never fails.
 * @param {string} aifRoot
 * @param {string} projectRoot
 * @returns {number} Always 0
 */
export function checkIntegrations(aifRoot, projectRoot) {
  let manifest;
  try {
    manifest = loadManifest(projectRoot);
  } catch (err) {
    console.log(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
  const installed = Object.keys(manifest.integrations).filter(
    (name) => isIntegration(name) && entryOf(manifest, name),
  );
  if (installed.length === 0) return 0;
  const drift = [];
  for (const name of installed) {
    for (const file of INTEGRATIONS[name].files) {
      const problem = symlinkProblem(projectRoot, file.target);
      if (problem) {
        drift.push(`${problem}: ${file.target} (${name})`);
        continue;
      }
      const path = join(projectRoot, ...file.target.split('/'));
      const desired = renderAsset(readTemplate(aifRoot, file.source), COMPARISON_PIN);
      const found = describeDrift({
        desired,
        onDisk: readIfPresent(path),
        recorded: recordedHash(entryOf(manifest, name), path),
      });
      if (found) drift.push(`${found}: ${file.target} (${name})`);
    }
  }
  if (drift.length === 0) {
    console.log(`✓ integrations (${installed.join(', ')}): current`);
  } else {
    console.log(`⚠ integrations (${installed.join(', ')}): ${drift.length} file(s) differ`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(
        `::warning::AIF integrations differ from the installed release (${drift.length} file(s))`,
      );
    }
    for (const line of drift) console.log(`    ${line}`);
    console.log('    Run `aif install -I <name>` to refresh a file, or --force over local edits.');
  }
  const missing = INTEGRATION_NAMES.filter((name) => !installed.includes(name));
  if (missing.length > 0) {
    console.log(`ℹ available, not installed: ${missing.join(', ')} (aif install -I <name>)`);
  }
  return 0;
}
