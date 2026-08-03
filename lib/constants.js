/**
 * Shared constants for the aif CLI.
 * Paths, filenames, directory names, and defaults used across modules.
 */

import { join } from 'node:path';

// --- Manifest ---

export const MANIFEST_FILENAME = '.installs.yaml';

// --- Source directories (relative to repo root) ---

export const SOURCE_DIRS = {
  agents: 'agents',
  skills: 'skills',
  steering: 'steering',
  servers: 'servers',
  bundles: 'bundles',
};

// --- Supported harnesses ---

export const HARNESSES = ['kiro'];

// --- CLI commands ---

export const COMMANDS = ['install', 'uninstall', 'status', 'list', 'validate', 'test'];

// --- Manifest key format ---

/**
 * Generates the manifest key for a bundle+harness combination.
 * @param {string} bundle
 * @param {string} harness
 * @returns {string}
 */
export function manifestKey(bundle, harness) {
  return `${bundle}_${harness}`;
}
