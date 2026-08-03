/**
 * Kiro harness adapter — transforms and installs ai-foundation components
 * into Kiro's native formats and locations.
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import YAML from 'yaml';

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

// --- Install: Agents ---

/**
 * Install agents to Kiro.
 * @param {string[]} agentFiles - Agent filenames, e.g. ["architect.yaml"]
 * @param {string} repoRoot
 * @returns {Array<{ path: string, hash: string }>} Installed file records
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
    const kiroJson = transformAgent(agent);

    const targetPath = join(TARGETS.agents, `${agent.name}.json`);
    const output = JSON.stringify(kiroJson, null, 2);
    writeToTarget(targetPath, output);
    installed.push({ path: targetPath, hash: hashContent(output) });
    console.log(`  ✓ agent: ${agent.name}`);
  }

  return installed;
}

// --- Install: Steering ---

/**
 * Install steering files to Kiro.
 * @param {string[]} steeringPaths - Relative paths from repo root, e.g. ["steering/global/core.md"]
 * @param {string} repoRoot
 * @returns {Array<{ path: string, hash: string }>} Installed file records
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

    // Flatten path: steering/global/core.md → global-core.md
    const targetName = relPath.replace(/^steering\//, '').replace(/\//g, '-');
    const targetPath = join(TARGETS.steering, targetName);
    writeToTarget(targetPath, transformed);
    installed.push({ path: targetPath, hash: hashContent(transformed) });
    console.log(`  ✓ steering: ${targetName}`);
  }

  return installed;
}

// --- Install: Skills ---

/**
 * Install skills to Kiro.
 * @param {string[]} skillNames - Skill folder names, e.g. ["decision-record"]
 * @param {string} repoRoot
 * @returns {Array<{ path: string, hash: string }>} Installed file records
 */
export function installSkills(skillNames, repoRoot) {
  const installed = [];

  for (const skillName of skillNames) {
    const files = getSkillFiles(skillName, repoRoot);
    for (const { src, relDest } of files) {
      if (!existsSync(src)) continue;
      const content = readFileSync(src);
      const targetPath = join(TARGETS.skills, skillName, relDest);
      writeToTarget(targetPath, content);
      installed.push({ path: targetPath, hash: hashContent(content) });
    }
    if (files.length > 0) {
      console.log(`  ✓ skill: ${skillName}`);
    }
  }

  return installed;
}

// --- Install: Servers (stub) ---

/**
 * Install servers to Kiro.
 * @param {string[]} serverNames - Server folder names
 * @param {string} _repoRoot
 * @returns {Array<{ path: string, hash: string }>} Installed file records
 */
export function installServers(serverNames, _repoRoot) {
  for (const name of serverNames) {
    console.log(`  ⊘ server: ${name} (not yet implemented)`);
  }
  return [];
}

// --- Transform functions (exported for unit testing) ---

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

/**
 * Get the list of files for a skill.
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

function writeToTarget(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function hashContent(content) {
  const data = typeof content === 'string' ? content : content.toString('utf8');
  return 'sha256:' + createHash('sha256').update(data).digest('hex');
}
