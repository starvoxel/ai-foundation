/**
 * Claude Code harness adapter — transforms and installs ai-foundation components
 * into Claude Code's native formats and locations.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import YAML from 'yaml';

import { createAdapter, parseFrontmatter } from './base.js';

// --- Target paths ---

export const TARGETS = {
  agents: join('.claude', 'agents'),
  rules: join('.claude', 'rules'),
  skills: join('.claude', 'skills'),
};

// --- Tool name map ---

/**
 * Maps ai-foundation generic tool names to Claude Code's built-in tool names.
 */
export const TOOL_MAP = {
  'read': 'Read',
  'write': 'Write',
  'shell': 'Bash',
  'web_search': 'WebSearch',
  'web_fetch': 'WebFetch',
  'grep': 'Grep',
  'glob': 'Glob',
  'code': 'LSP',
};

// --- Tool mapping ---

/**
 * Map a single tool name from our format to Claude Code's format.
 * @param {string} name
 * @returns {string}
 */
export function mapToolName(name) {
  return TOOL_MAP[name] || name;
}

// --- Transform functions ---

/**
 * Transform an ai-foundation agent YAML into Claude Code's markdown agent format.
 * @param {object} agent - Parsed agent YAML object
 * @returns {string} Markdown with YAML frontmatter
 */
export function transformAgent(agent) {
  const tools = (agent.tools || []).map(mapToolName);

  const frontmatter = {
    name: agent.name,
    description: agent.description,
    tools: tools.join(', '),
  };

  const yamlStr = YAML.stringify(frontmatter).trim();
  const prompt = agent.prompt || '';
  return `---\n${yamlStr}\n---\n\n${prompt.trim()}\n`;
}

/**
 * Transform steering file content for Claude Code.
 * Rewrites frontmatter: file_patterns → paths.
 * Strips framework-specific fields. Passes body through unchanged.
 *
 * @param {string} content - Raw markdown file content with YAML frontmatter
 * @returns {string} Transformed content with Claude Code-compatible frontmatter
 */
export function transformSteering(content) {
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter) {
    return content;
  }

  const filePatterns = frontmatter.file_patterns;
  if (Array.isArray(filePatterns) && filePatterns.length > 0) {
    const claudeFrontmatter = { paths: filePatterns };
    const yamlStr = YAML.stringify(claudeFrontmatter).trim();
    return `---\n${yamlStr}\n---\n${body}`;
  }

  // No file_patterns or empty = always loaded = no frontmatter needed
  return body;
}

// --- Skill sources ---

/**
 * Get skill source for Claude Code (single SKILL.md file).
 * @param {string} skillName
 * @param {string} repoRoot
 * @returns {Array<{src: string, targetPath: string}>}
 */
function getSkillSources(skillName, repoRoot) {
  const src = join(repoRoot, 'skills', skillName, 'SKILL.md');
  if (!existsSync(src)) {
    return [];
  }
  return [{ src, targetPath: join(TARGETS.skills, `${skillName}.md`) }];
}

// --- Create adapter instance ---

const adapter = createAdapter({
  targets: TARGETS,
  toolMap: TOOL_MAP,
  transformAgent,
  transformSteering,
  agentExt: '.md',
  steeringDir: 'rules',
  getSkillSources,
});

// --- Re-export adapter install methods and shared utilities ---

export const installAgents = adapter.installAgents;
export const installSteering = adapter.installSteering;
export const installSkills = adapter.installSkills;
export const installServers = adapter.installServers;
export { parseFrontmatter } from './base.js';
