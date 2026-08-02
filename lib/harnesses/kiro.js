/**
 * Kiro harness adapter — transforms ai-foundation components into Kiro's native formats.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

// --- Tool name map ---

/**
 * Maps ai-foundation generic tool names to Kiro's built-in tool names.
 * Our generic names are aligned with Kiro/Copilot, so these are identity mappings.
 * The map serves as documentation of supported tools and the extension point for
 * future adapters where names diverge (e.g. Claude Code: shell → Bash, code → LSP).
 */
export const TOOL_MAP = {
  'read': 'read',
  'write': 'write',
  'shell': 'shell',
  'web_search': 'web_search',
  'web_fetch': 'web_fetch',
  'grep': 'grep',
  'glob': 'glob',
  'code': 'code',
};

/**
 * Map a single tool name from our format to Kiro's format.
 * @param {string} name
 * @returns {string}
 */
export function mapToolName(name) {
  return TOOL_MAP[name] || name;
}

// --- Agent transform ---

/**
 * Transform an ai-foundation agent YAML into Kiro's JSON agent format.
 * @param {object} agent - Parsed agent YAML object
 * @returns {object} Kiro agent JSON
 */
export function transformAgent(agent) {
  const tools = (agent.tools || []).map(mapToolName);
  const allowedTools = (agent.approved_tools || []).map(mapToolName);

  const resources = ['file://.kiro/steering/**/*.md'];

  if (Array.isArray(agent.skills)) {
    for (const ref of agent.skills) {
      const name = ref.startsWith('skill/') ? ref.slice('skill/'.length) : ref;
      if (name) {
        resources.push(`skill://.kiro/skills/${name}/SKILL.md`);
      }
    }
  }

  return {
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    tools,
    allowedTools,
    resources,
  };
}

// --- Steering transform ---

/**
 * Transform steering file content for Kiro.
 * Rewrites frontmatter: file_patterns → inclusion + fileMatchPattern.
 * Strips framework-specific fields. Passes body through unchanged.
 *
 * @param {string} content - Raw markdown file content with YAML frontmatter
 * @returns {string} Transformed content with Kiro-compatible frontmatter
 */
export function transformSteering(content) {
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter) {
    return content;
  }

  const kiroFrontmatter = {};

  const filePatterns = frontmatter.file_patterns;
  if (Array.isArray(filePatterns) && filePatterns.length > 0) {
    kiroFrontmatter.inclusion = 'fileMatch';
    kiroFrontmatter.fileMatchPattern = filePatterns.join(', ');
  } else {
    kiroFrontmatter.inclusion = 'always';
  }

  const yamlStr = YAML.stringify(kiroFrontmatter).trim();
  return `---\n${yamlStr}\n---\n${body}`;
}

/**
 * Parse YAML frontmatter from markdown content.
 * @param {string} content
 * @returns {{ frontmatter: object|null, body: string }}
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: content };
  }
  const frontmatter = YAML.parse(match[1]);
  const body = match[2];
  return { frontmatter, body };
}

// --- Skills copy ---

/**
 * Get the list of files to copy for a skill.
 * Returns relative paths within the skill directory.
 *
 * @param {string} skillName - Skill folder name
 * @param {string} repoRoot - Absolute path to repo root
 * @returns {Array<{ src: string, dest: string }>} File copy operations
 */
export function getSkillFiles(skillName, repoRoot) {
  const skillDir = join(repoRoot, 'skills', skillName);
  return collectFiles(skillDir).map((relPath) => ({
    src: join(skillDir, relPath),
    dest: join('.kiro', 'skills', skillName, relPath),
  }));
}

/**
 * Recursively collect all files in a directory, returning paths relative to dir.
 * @param {string} dir
 * @param {string} [prefix='']
 * @returns {string[]}
 */
function collectFiles(dir, prefix = '') {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name !== '_template') {
        results.push(...collectFiles(join(dir, entry.name), relPath));
      }
    } else {
      results.push(relPath);
    }
  }
  return results;
}

// --- Server transform (stub) ---

/**
 * Transform a server definition for Kiro.
 * Generates an MCP JSON entry for ~/.kiro/settings/mcp.json.
 *
 * @param {object} _server - Parsed server YAML object
 * @returns {object|null} MCP server config entry, or null if not yet implemented
 */
export function transformServer(_server) {
  // Stub — no real servers exist yet (only _template).
  // Will be implemented when the first server definition is added.
  return null;
}
