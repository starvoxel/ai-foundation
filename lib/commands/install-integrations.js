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
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  INTEGRATIONS,
  INTEGRATIONS_DIR,
  INTEGRATION_NAMES,
  SNIPPETS,
  describeDrift,
  planFile,
  pinlessHash,
  refreshedByUpdate,
  renderAsset,
} from '../integrations.js';
import { explicitPin, pickLatestTag } from '../release-pin.js';
import { readManifest, setSectionEntry, writeManifest } from '../manifest.js';

/** Stands in for the pin when only the structure of a workflow is compared. */
const COMPARISON_PIN = { sha: '0'.repeat(40), version: 'v0.0.0' };

/**
 * @param {string} aifRoot
 * @param {string} source - Template path relative to the ai-foundation root
 * @returns {string}
 */
function readTemplate(aifRoot, source) {
  return readFileSync(join(aifRoot, ...source.split('/')), 'utf8');
}

/**
 * @param {string} path
 * @returns {string|null} Content, or null when the file does not exist
 */
function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * The pin to write into workflows: explicit flags, else the latest release tag
 * in the ai-foundation checkout.
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
  /** @type {string[]} */
  let tags;
  try {
    tags = git(aifRoot, ['tag', '--list']).split('\n');
  } catch (err) {
    throw new Error(
      `Could not read release tags from ${aifRoot}: ${err instanceof Error ? err.message : err}. Pass --pin <sha> --pin-version <vX.Y.Z>.`,
      { cause: err },
    );
  }
  const tag = pickLatestTag(tags);
  if (tag === null) {
    throw new Error(
      `No release tag (vX.Y.Z) in ${aifRoot}, so there is nothing to pin. Fetch tags, or pass --pin <sha> --pin-version <vX.Y.Z>.`,
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
 * @param {string} projectRoot
 * @returns {{ dir: string, base: string }}
 */
function manifestLocation(projectRoot) {
  return { dir: join(projectRoot, INTEGRATIONS_DIR), base: projectRoot };
}

/**
 * Hash recorded for a project file in an integration's manifest entry, if any.
 * @param {Record<string, any>|undefined} entry
 * @param {string} path - Absolute path
 * @returns {string|null}
 */
function recordedHash(entry, path) {
  const file = Array.isArray(entry?.files) ? entry.files.find((f) => f.path === path) : undefined;
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

const MARK = { write: '✓', current: '✓', adopt: '✓', skip: '⚠' };

/**
 * Install the named integrations into the project.
 * @param {object} options
 * @param {string[]} options.names - Integration names, already validated
 * @param {string} options.aifRoot
 * @param {string} options.projectRoot
 * @param {Record<string, string|boolean>} options.args - For --pin, --pin-version and --force
 * @returns {number} Exit code: 0, or 1 when no pin could be resolved
 */
export function installIntegrations({ names, aifRoot, projectRoot, args }) {
  const needsPin = names.some((name) => INTEGRATIONS[name].files.some((f) => f.pinned));
  let pin = null;
  if (needsPin) {
    try {
      pin = resolvePin(aifRoot, args);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }
  const force = args.force === true;
  const location = manifestLocation(projectRoot);
  let manifest = readManifest(location.dir, location.base);

  for (const name of names) {
    const integration = INTEGRATIONS[name];
    const entry = manifest.integrations[name];
    /** @type {Array<{ path: string, hash: string }>} */
    const recorded = [];
    for (const file of integration.files) {
      const path = join(projectRoot, ...file.target.split('/'));
      const desired = renderAsset(readTemplate(aifRoot, file.source), file.pinned ? pin : null);
      const onDisk = readIfPresent(path);
      const before = recordedHash(entry, path);
      const plan = planFile({ desired, onDisk, recorded: before, force });
      if (plan.action === 'write') writeProjectFile(path, desired, file.executable);
      console.log(`${MARK[plan.action]} ${name}: ${file.target} (${plan.reason})`);
      if (plan.action === 'skip') {
        if (before !== null) recorded.push({ path, hash: before });
        continue;
      }
      recorded.push({
        path,
        hash: pinlessHash(plan.action === 'write' ? desired : (onDisk ?? '')),
      });
    }
    manifest = setSectionEntry(manifest, 'integrations', name, {
      version: aifVersion(aifRoot),
      files: recorded,
    });
  }
  writeManifest(location.dir, manifest, location.base);

  const wanted = [...new Set(names.flatMap((name) => INTEGRATIONS[name].snippets))];
  for (const key of wanted) {
    console.log(`ℹ ${SNIPPETS[key].file} is yours; AIF does not edit it. ${SNIPPETS[key].text}`);
  }
  return 0;
}

/**
 * `aif install --update`: refresh the recorded integration files that carry no pins.
 * Pinned workflow files are reported when their template changed; they are
 * refreshed by `aif install -I <name>`.
 * @param {string} aifRoot
 * @param {string} projectRoot
 * @returns {number} Always 0
 */
export function updateIntegrations(aifRoot, projectRoot) {
  const location = manifestLocation(projectRoot);
  let manifest = readManifest(location.dir, location.base);
  let changed = false;
  for (const name of Object.keys(manifest.integrations)) {
    const integration = INTEGRATIONS[name];
    if (!integration) continue;
    const entry = manifest.integrations[name];
    /** @type {Array<{ path: string, hash: string }>} */
    const recorded = [];
    for (const file of integration.files) {
      const path = join(projectRoot, ...file.target.split('/'));
      const before = recordedHash(entry, path);
      const desired = renderAsset(
        readTemplate(aifRoot, file.source),
        file.pinned ? COMPARISON_PIN : null,
      );
      const onDisk = readIfPresent(path);
      if (!refreshedByUpdate(file)) {
        const drift = describeDrift({ desired, onDisk, recorded: before });
        if (drift === 'update available') {
          console.log(
            `↷ ${name}: ${file.target} has a newer template; run \`aif install -I ${name}\``,
          );
        }
        if (before !== null) recorded.push({ path, hash: before });
        continue;
      }
      const plan = planFile({ desired, onDisk, recorded: before });
      if (plan.action === 'write') {
        writeProjectFile(path, desired, file.executable);
        changed = true;
        console.log(`↻ ${name}: ${file.target} (${plan.reason})`);
      } else if (plan.action === 'skip') {
        console.log(`⚠ ${name}: ${file.target} (${plan.reason}; left alone)`);
        if (before !== null) recorded.push({ path, hash: before });
        continue;
      }
      recorded.push({
        path,
        hash: pinlessHash(plan.action === 'write' ? desired : (onDisk ?? '')),
      });
    }
    manifest = setSectionEntry(manifest, 'integrations', name, {
      version: aifVersion(aifRoot),
      files: recorded,
    });
  }
  if (Object.keys(manifest.integrations).length > 0) {
    writeManifest(location.dir, manifest, location.base);
  }
  if (!changed && Object.keys(manifest.integrations).length > 0) {
    console.log('✓ integrations: already current');
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
  const location = manifestLocation(projectRoot);
  const manifest = readManifest(location.dir, location.base);
  const installed = Object.keys(manifest.integrations).filter((name) => name in INTEGRATIONS);
  if (installed.length === 0) return 0;
  const drift = [];
  for (const name of installed) {
    for (const file of INTEGRATIONS[name].files) {
      const path = join(projectRoot, ...file.target.split('/'));
      const desired = renderAsset(readTemplate(aifRoot, file.source), COMPARISON_PIN);
      const found = describeDrift({
        desired,
        onDisk: readIfPresent(path),
        recorded: recordedHash(manifest.integrations[name], path),
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
