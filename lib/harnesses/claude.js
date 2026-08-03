/**
 * Claude Code harness adapter — transforms and installs ai-foundation components
 * into Claude Code's native formats and locations.
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';

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

/**
 * Map a single tool name from our format to Claude Code's format.
 * @param {string} name
 * @returns {string}
 */
export function mapToolName(name) {
  return TOOL_MAP[name] || name;
}

// --- Install: Agents ---

/**
 * Install agents to Claude Code.
 * @param {string[]} agentFiles - Agent filenames, e.g. ["architect.yaml"]
 * @param {string} repoRoot
 * @returns {Array<{ path: string, hash: string }>}
 */
export function installAgents(agentFiles, repoRoot) {
  const installed = [];

  for (const file of agentFiles) {
    const srcPath = join(repoRoot, 'agents', file);
    if (!existsSync(srcPath)) {
      console.error(`  ✗ agent source not found: ${file}`);
      continue;
    }
    const content = readFileSync(srcPath, 'utf8');
    const agent = YAML.parse(content);
    const output = transformAgent(agent);

    const targetPath = join(TARGETS.agents, `${agent.name}.md`);
    writeToTarget(targetPath, output);
    installed.push({ path: targetPath, hash: hashContent(output) });
    console.log(`  ✓ agent: ${agent.name}`);
  }

  return installed;
}

// --- Install: Steering (rules) ---

/**
 * Install steering files as Claude Code rules.
 * @param {string[]} steeringPaths - Relative paths from repo root
 * @param {string} repoRoot
 * @returns {Array<{ path: string, hash: string }>}
 */
export function installSteering(steeringPaths, repoRoot) {
  const installed = [];

  for (const relPath of steeringPaths) {
    const srcPath = join(repoRoot, relPath);
    if (!existsSync(srcPath)) {
      console.error(`  ✗ steering source not found: ${relPath}`);
      continue;
    }
    const content = readFileSync(srcPath, 'utf8');
    const transformed = transformSteering(content);

    const targetName = relPath.replace(/^steering\//, '').replace(/\//g, '-');
    const targetPath = join(TARGETS.rules, targetName);
    writeToTarget(targetPath, transformed);
    installed.push({ path: targetPath, hash: hashContent(transformed) });
    console.log(`  ✓ rule: ${targetName}`);
  }

  return installed;
}

// --- Install: Skills ---

/**
 * Install skills to Claude Code.
 * @param {string[]} skillNames - Skill folder names
 * @param {string} repoRoot
 * @returns {Array<{ path: string, hash: string }>}
 */
export function installSkills(skillNames, repoRoot) {
  const installed = [];

  for (const skillName of skillNames) {
    const skillPath = join(repoRoot, 'skills', skillName, 'SKILL.md');
    if (!existsSync(skillPath)) {
      console.error(`  ✗ skill source not found: ${skillName}`);
      continue;
    }
    const content = readFileSync(skillPath, 'utf8');

    // Claude Code skills are single .md files with name + description in frontmatter
    const targetPath = join(TARGETS.skills, `${skillName}.md`);
    writeToTarget(targetPath, content);
    installed.push({ path: targetPath, hash: hashContent(content) });
    console.log(`  ✓ skill: ${skillName}`);
  }

  return installed;
}

// --- Install: Servers (stub) ---

/**
 * Install servers to Claude Code.
 * @param {string[]} serverNames
 * @param {string} _repoRoot
 * @returns {Array<{ path: string, hash: string }>}
 */
export function installServers(serverNames, _repoRoot) {
  for (const name of serverNames) {
    console.log(`  ⊘ server: ${name} (not yet implemented)`);
  }
  return [];
}

// --- Transform functions (exported for unit testing) ---

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

// --- Helpers ---

function writeToTarget(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function hashContent(content) {
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}
