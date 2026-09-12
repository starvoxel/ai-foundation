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
  standards: 'standards',
  bundles: 'bundles',
  // Where harness-level shared hook resources live (e.g. Claude Code's
  // block-command hook script). One subdirectory per resource name.
  hookAssets: join('lib', 'harnesses', 'assets'),
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
  // Human-in-the-loop proposal gate (e.g. Claude Code's Plan Mode). No
  // native equivalent on every harness — see each adapter's TOOL_MAP.
  PLAN: 'plan',
  // Structured, blocking question to a human attending the session live.
  // Only fits agents a human interacts with directly — not per-chunk
  // background implementation agents, which already escalate asynchronously
  // via chunk `Blocked` status (see skill/chunk-orchestration Step 4).
  ASK_USER: 'ask_user',
  // Personal, session-scoped progress checklist for an agent's own
  // multi-step work. Not a substitute for chunks.json, which remains the
  // durable, cross-harness source of truth for orchestration state.
  TASK: 'task',
};

// --- Supported harnesses ---

export const HARNESSES = ['kiro', 'claude'];

// --- Knowledge file types ---

export const KNOWLEDGE_TYPES = ['decision', 'reference', 'architecture', 'api', 'business-rule'];

// --- CLI commands ---

export const COMMANDS = [
  'install',
  'uninstall',
  'status',
  'list',
  'validate',
  'test',
  'snapshot',
  'index',
  'init',
];

// --- Manifest key format ---

/**
 * Generates the manifest key for a bundle/server/hook + harness combination.
 * @param {string} name
 * @param {string} harness
 * @returns {string}
 */
export function manifestKey(name, harness) {
  return `${name}_${harness}`;
}
