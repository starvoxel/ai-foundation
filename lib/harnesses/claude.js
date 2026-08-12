/**
 * Claude Code harness adapter — transforms and installs ai-foundation components
 * into Claude Code's native formats and locations.
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import YAML from 'yaml';

import { createAdapter, parseFrontmatter, collectFiles, writeToTarget, hashContent } from './base.js';
import { TOOLS } from '../constants.js';

// --- Target paths ---

export const TARGETS = {
  agents: join('.claude', 'agents'),
  rules: join('.claude', 'rules'),
  skills: join('.claude', 'skills'),
  servers: join('.claude', 'servers'),
  standards: join('.claude', 'standards'),
  mcpSettings: '.mcp.json',
};

// --- Tool name map ---

/**
 * Maps ai-foundation generic tool names to Claude Code's built-in tool names.
 */
export const TOOL_MAP = {
  [TOOLS.READ]: 'Read',
  [TOOLS.WRITE]: 'Write',
  [TOOLS.SHELL]: 'Bash',
  [TOOLS.WEB_SEARCH]: 'WebSearch',
  [TOOLS.WEB_FETCH]: 'WebFetch',
  [TOOLS.GREP]: 'Grep',
  [TOOLS.GLOB]: 'Glob',
  [TOOLS.CODE]: 'LSP',
  [TOOLS.SUBAGENT]: 'Agent',
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

  // Emit permission deny rules for blocked shell commands
  if (Array.isArray(agent.blocked_commands) && agent.blocked_commands.length > 0) {
    frontmatter.permissions = {
      deny: agent.blocked_commands.map(pattern => `Bash(${pattern})`),
    };
  }

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
    return content.replace(/\{\{standards_path\}\}/g, TARGETS.standards);
  }

  const filePatterns = frontmatter.file_patterns;
  if (Array.isArray(filePatterns) && filePatterns.length > 0) {
    const claudeFrontmatter = { paths: filePatterns };
    const yamlStr = YAML.stringify(claudeFrontmatter).trim();
    const resolvedBody = body.replace(/\{\{standards_path\}\}/g, TARGETS.standards);
    return `---\n${yamlStr}\n---\n${resolvedBody}`;
  }

  // No file_patterns or empty = always loaded = no frontmatter needed
  return body.replace(/\{\{standards_path\}\}/g, TARGETS.standards);
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

// --- MCP server installation ---

/**
 * Install an MCP server with stdio transport for Claude Code.
 * Copies runtime files to .claude/servers/{name}/, runs npm install,
 * and registers the server in .mcp.json.
 *
 * @param {string} name - Server folder name
 * @param {object} serverDef - Parsed server YAML definition
 * @param {string} repoRoot - Absolute path to the repository root
 * @returns {Array<{path: string, hash: string}>} Manifest entries
 */
function installMcpStdio(name, serverDef, repoRoot) {
  const installed = [];
  const serverSrcDir = join(repoRoot, 'servers', name);
  const serverTargetDir = join(TARGETS.servers, name);

  // Collect runtime files (exclude tests/ and .test.js files)
  const allFiles = collectFiles(serverSrcDir);
  const runtimeFiles = allFiles.filter(f =>
    !f.startsWith('tests/') && !f.endsWith('.test.js')
  );

  // Copy runtime files to target
  for (const relPath of runtimeFiles) {
    const src = join(serverSrcDir, relPath);
    const targetPath = join(serverTargetDir, relPath);
    const content = readFileSync(src);
    writeToTarget(targetPath, content);
    installed.push({ path: targetPath, hash: hashContent(content) });
  }

  // Run npm install in the target directory if package.json exists
  const targetPkgJson = join(serverTargetDir, 'package.json');
  if (existsSync(targetPkgJson)) {
    try {
      execSync('npm install --omit=dev', { cwd: serverTargetDir, stdio: 'pipe' });
    } catch (err) {
      console.error(`  ✗ npm install failed for server "${name}": ${err.message}`);
      return installed;
    }
  }

  // Register in .mcp.json
  const entryPoint = join(serverTargetDir, 'index.js');
  const mcpEntry = {
    command: 'node',
    args: [entryPoint],
  };
  mergeMcpSettings(name, mcpEntry);

  console.log(`  ✓ server: ${name} (mcp/stdio)`);
  return installed;
}

/**
 * Install an MCP server with HTTP transport for Claude Code.
 * No files to copy — just registers the server URL in .mcp.json.
 *
 * @param {string} name - Server folder name
 * @param {object} serverDef - Parsed server YAML definition
 * @param {string} _repoRoot - Unused
 * @returns {Array<{path: string, hash: string}>} Manifest entries
 */
function installMcpHttp(name, serverDef, _repoRoot) {
  const installed = [];

  if (!serverDef.url) {
    console.error(`  ✗ server "${name}" has transport: http but no url field`);
    return installed;
  }

  const mcpEntry = {
    type: 'http',
    url: serverDef.url,
  };

  if (serverDef.headers) {
    mcpEntry.headers = serverDef.headers;
  }

  mergeMcpSettings(name, mcpEntry);

  console.log(`  ✓ server: ${name} (mcp/http)`);
  return installed;
}

/**
 * Read, merge, and write an entry into the MCP settings file.
 * Creates the file if it doesn't exist.
 *
 * @param {string} serverName - Key for the mcpServers object
 * @param {object} entry - The server config entry to merge
 */
function mergeMcpSettings(serverName, entry) {
  let settings = { mcpServers: {} };

  if (existsSync(TARGETS.mcpSettings)) {
    try {
      const content = readFileSync(TARGETS.mcpSettings, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        settings = parsed;
        if (!settings.mcpServers) settings.mcpServers = {};
      }
    } catch {
      // Corrupted file — overwrite
    }
  }

  settings.mcpServers[serverName] = entry;
  const output = JSON.stringify(settings, null, 2);
  writeToTarget(TARGETS.mcpSettings, output);
}

/**
 * Remove a server entry from the MCP settings file.
 *
 * @param {string} serverName - Key to remove from mcpServers
 */
export function removeMcpSetting(serverName) {
  if (!existsSync(TARGETS.mcpSettings)) return;

  try {
    const content = readFileSync(TARGETS.mcpSettings, 'utf8');
    const settings = JSON.parse(content);
    if (settings && settings.mcpServers) {
      delete settings.mcpServers[serverName];
      const output = JSON.stringify(settings, null, 2);
      writeToTarget(TARGETS.mcpSettings, output);
    }
  } catch {
    // If we can't parse it, leave it alone
  }
}

/**
 * MCP protocol installer — dispatches by transport type.
 *
 * @param {string} name - Server folder name
 * @param {object} serverDef - Parsed server YAML
 * @param {string} repoRoot - Repo root path
 * @returns {Array<{path: string, hash: string}>}
 */
function installMcpServer(name, serverDef, repoRoot) {
  const transport = serverDef.transport || 'stdio';
  switch (transport) {
    case 'stdio':
      return installMcpStdio(name, serverDef, repoRoot);
    case 'http':
      return installMcpHttp(name, serverDef, repoRoot);
    default:
      console.error(`  ✗ server "${name}" has unsupported MCP transport: ${transport}`);
      return [];
  }
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
  serverInstallers: {
    mcp: installMcpServer,
  },
});

// --- Re-export adapter install methods and shared utilities ---

export const installAgents = adapter.installAgents;
export const installSteering = adapter.installSteering;
export const installSkills = adapter.installSkills;
export const installServers = adapter.installServers;
export const installStandards = adapter.installStandards;
export { parseFrontmatter } from './base.js';
