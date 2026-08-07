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

// --- Harness-agnostic tool names ---

/**
 * Canonical tool identifiers used across all harness adapters.
 * Harness-specific TOOL_MAPs use these as keys, mapping to harness-native names.
 * Changing a value here updates every adapter automatically.
 */
export const TOOLS = {
  READ: 'read',
  WRITE: 'write',
  SHELL: 'shell',
  WEB_SEARCH: 'web_search',
  WEB_FETCH: 'web_fetch',
  GREP: 'grep',
  GLOB: 'glob',
  CODE: 'code',
  SUBAGENT: 'subagent',
};

// --- Supported harnesses ---

export const HARNESSES = ['kiro', 'claude'];

// --- CLI commands ---

export const COMMANDS = ['install', 'uninstall', 'status', 'list', 'validate', 'test', 'snapshot'];

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
