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

// --- Pure data operations (no I/O) ---

/**
 * Resolves the manifest file path for a given repo root.
 * @param {string} repoRoot
 * @returns {string}
 */
export function manifestPath(repoRoot) {
  return join(repoRoot, MANIFEST_FILENAME);
}

/**
 * Parse manifest YAML content into an object.
 * @param {string} content - Raw YAML string
 * @returns {Record<string, { version: string, files: Array<{ path: string, hash: string }> }>}
 */
export function parseManifest(content) {
  const parsed = YAML.parse(content);
  return parsed || {};
}

/**
 * Serialize a manifest object to YAML.
 * @param {Record<string, { version: string, files: Array<{ path: string, hash: string }> }>} data
 * @returns {string}
 */
export function serializeManifest(data) {
  return YAML.stringify(data);
}

/**
 * Get a single entry from a manifest object.
 * @param {object} manifest
 * @param {string} key
 * @returns {{ version: string, files: Array<{ path: string, hash: string }> } | undefined}
 */
export function getManifestEntry(manifest, key) {
  return manifest[key];
}

/**
 * Set (create or update) an entry in a manifest object. Returns a new object.
 * @param {object} manifest
 * @param {string} key
 * @param {{ version: string, files: Array<{ path: string, hash: string }> }} entry
 * @returns {object}
 */
export function setManifestEntry(manifest, key, entry) {
  return { ...manifest, [key]: entry };
}

/**
 * Remove an entry from a manifest object. Returns { manifest, removed }.
 * @param {object} manifest
 * @param {string} key
 * @returns {{ manifest: object, removed: boolean }}
 */
export function removeManifestEntry(manifest, key) {
  if (!(key in manifest)) {
    return { manifest, removed: false };
  }
  const { [key]: _, ...rest } = manifest;
  return { manifest: rest, removed: true };
}

// --- I/O operations ---

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
  return parseManifest(content);
}

/**
 * Writes the manifest to disk.
 * @param {string} repoRoot
 * @param {Record<string, { version: string, files: Array<{ path: string, hash: string }> }>} data
 */
export function writeManifest(repoRoot, data) {
  const filePath = manifestPath(repoRoot);
  const content = serializeManifest(data);
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Gets a single entry from the manifest on disk.
 * @param {string} repoRoot
 * @param {string} key - e.g. "engineering_kiro"
 * @returns {{ version: string, files: Array<{ path: string, hash: string }> } | undefined}
 */
export function getEntry(repoRoot, key) {
  const manifest = readManifest(repoRoot);
  return getManifestEntry(manifest, key);
}

/**
 * Sets (creates or updates) a single entry in the manifest on disk.
 * @param {string} repoRoot
 * @param {string} key
 * @param {{ version: string, files: Array<{ path: string, hash: string }> }} entry
 */
export function setEntry(repoRoot, key, entry) {
  const manifest = readManifest(repoRoot);
  const updated = setManifestEntry(manifest, key, entry);
  writeManifest(repoRoot, updated);
}

/**
 * Removes a single entry from the manifest on disk.
 * @param {string} repoRoot
 * @param {string} key
 * @returns {boolean} true if the entry existed and was removed
 */
export function removeEntry(repoRoot, key) {
  const manifest = readManifest(repoRoot);
  const { manifest: updated, removed } = removeManifestEntry(manifest, key);
  if (removed) {
    writeManifest(repoRoot, updated);
  }
  return removed;
}
