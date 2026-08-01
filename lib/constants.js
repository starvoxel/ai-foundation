/**
 * Shared constants for the aif CLI.
 * Paths, filenames, directory names, and defaults used across modules.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

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

// --- Kiro harness target paths ---

const kiroBase = join(homedir(), '.kiro');

export const KIRO_TARGETS = {
  agents: join(kiroBase, 'agents'),
  steering: join(kiroBase, 'steering'),
  skills: join(kiroBase, 'skills'),
  servers: join(kiroBase, 'servers'),
  mcpSettings: join(kiroBase, 'settings', 'mcp.json'),
};

// --- Supported harnesses ---

export const HARNESSES = ['kiro'];

// --- CLI commands ---

export const COMMANDS = ['install', 'uninstall', 'status', 'list'];

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
