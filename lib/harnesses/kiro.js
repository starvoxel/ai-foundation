/**
 * Kiro harness adapter — transforms and installs ai-foundation components
 * into Kiro's native formats and locations.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import YAML from 'yaml';

import { createAdapter, parseFrontmatter, collectFiles } from './base.js';
import { TOOLS } from '../constants.js';

// --- Target paths ---

const kiroBase = join(homedir(), '.kiro');

export const TARGETS = {
  agents: join(kiroBase, 'agents'),
  steering: join(kiroBase, 'steering'),
  skills: join(kiroBase, 'skills'),
  servers: join(kiroBase, 'servers'),
  mcpSettings: join(kiroBase, 'settings', 'mcp.json'),
};

// --- Tool name map ---

/**
 * Maps ai-foundation generic tool names to Kiro's built-in tool names.
 * Our generic names are aligned with Kiro/Copilot, so these are identity mappings.
 * The map serves as documentation of supported tools and the extension point for
 * future adapters where names diverge (e.g. Claude Code: shell → Bash, code → LSP).
 */
export const TOOL_MAP = {
  [TOOLS.READ]: 'read',
  [TOOLS.WRITE]: 'write',
  [TOOLS.SHELL]: 'shell',
  [TOOLS.WEB_SEARCH]: 'web_search',
  [TOOLS.WEB_FETCH]: 'web_fetch',
  [TOOLS.GREP]: 'grep',
  [TOOLS.GLOB]: 'glob',
  [TOOLS.CODE]: 'code',
};

// --- Tool mapping ---

/**
 * Map a single tool name from our format to Kiro's format.
 * @param {string} name
 * @returns {string}
 */
export function mapToolName(name) {
  return TOOL_MAP[name] || name;
}

// --- Transform functions ---

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

// --- Skill sources ---

/**
 * Get the list of files for a skill (full directory tree for Kiro).
 * @param {string} skillName
 * @param {string} repoRoot
 * @returns {Array<{ src: string, relDest: string }>}
 */
export function getSkillFiles(skillName, repoRoot) {
  const skillDir = join(repoRoot, 'skills', skillName);
  return collectFiles(skillDir).map((relPath) => ({
    src: join(skillDir, relPath),
    relDest: relPath,
  }));
}

/**
 * Get skill sources in the format expected by createAdapter.
 * @param {string} skillName
 * @param {string} repoRoot
 * @returns {Array<{src: string, targetPath: string}>}
 */
function getSkillSources(skillName, repoRoot) {
  const skillDir = join(repoRoot, 'skills', skillName);
  return collectFiles(skillDir).map((relPath) => ({
    src: join(skillDir, relPath),
    targetPath: join(TARGETS.skills, skillName, relPath),
  }));
}

// --- Create adapter instance ---

const adapter = createAdapter({
  targets: TARGETS,
  toolMap: TOOL_MAP,
  transformAgent,
  transformSteering,
  agentExt: '.json',
  steeringDir: 'steering',
  getSkillSources,
});

// --- Re-export adapter install methods and shared utilities ---

export const installAgents = adapter.installAgents;
export const installSteering = adapter.installSteering;
export const installSkills = adapter.installSkills;
export const installServers = adapter.installServers;
export { parseFrontmatter } from './base.js';
