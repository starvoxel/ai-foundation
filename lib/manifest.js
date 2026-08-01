/**
 * Manifest module — reads and writes .installs.yaml.
 *
 * The manifest tracks what has been installed, keyed by {bundle}_{harness}.
 * Each entry stores the bundle version and a list of { path, hash } pairs.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { MANIFEST_FILENAME } from './constants.js';

/**
 * Resolves the manifest file path for a given repo root.
 * @param {string} repoRoot
 * @returns {string}
 */
export function manifestPath(repoRoot) {
  return join(repoRoot, MANIFEST_FILENAME);
}

/**
 * Reads the manifest from disk. Returns an empty object if the file doesn't exist.
 * @param {string} repoRoot
 * @returns {Record<string, { version: string, files: Array<{ path: string, hash: string }> }>}
 */
export function readManifest(repoRoot) {
  const filePath = manifestPath(repoRoot);
  if (!existsSync(filePath)) {
    return {};
  }
  const content = readFileSync(filePath, 'utf8');
  const parsed = YAML.parse(content);
  return parsed || {};
}

/**
 * Writes the manifest to disk.
 * @param {string} repoRoot
 * @param {Record<string, { version: string, files: Array<{ path: string, hash: string }> }>} data
 */
export function writeManifest(repoRoot, data) {
  const filePath = manifestPath(repoRoot);
  const content = YAML.stringify(data);
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Gets a single entry from the manifest.
 * @param {string} repoRoot
 * @param {string} key - e.g. "engineering_kiro"
 * @returns {{ version: string, files: Array<{ path: string, hash: string }> } | undefined}
 */
export function getEntry(repoRoot, key) {
  const manifest = readManifest(repoRoot);
  return manifest[key];
}

/**
 * Sets (creates or updates) a single entry in the manifest.
 * @param {string} repoRoot
 * @param {string} key
 * @param {{ version: string, files: Array<{ path: string, hash: string }> }} entry
 */
export function setEntry(repoRoot, key, entry) {
  const manifest = readManifest(repoRoot);
  manifest[key] = entry;
  writeManifest(repoRoot, manifest);
}

/**
 * Removes a single entry from the manifest.
 * @param {string} repoRoot
 * @param {string} key
 * @returns {boolean} true if the entry existed and was removed
 */
export function removeEntry(repoRoot, key) {
  const manifest = readManifest(repoRoot);
  if (!(key in manifest)) {
    return false;
  }
  delete manifest[key];
  writeManifest(repoRoot, manifest);
  return true;
}
