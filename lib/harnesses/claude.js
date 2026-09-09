/**
 * Claude Code harness adapter — transforms and installs ai-foundation components
 * into Claude Code's native formats and locations.
 *
 * v1 scope: global only. All targets live under the user's home directory,
 * matching Claude Code's native "personal" (user-scope) locations — agents and
 * skills at ~/.claude/{agents,skills}, and user-scope MCP servers registered in
 * ~/.claude.json (NOT ~/.claude/mcp.json, which Claude Code silently ignores).
 */

import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import YAML from 'yaml';

import {
  createAdapter,
  parseFrontmatter,
  collectFiles,
  writeToTarget,
  hashContent,
} from './base.js';
import { TOOLS } from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Target paths ---

const claudeBase = join(homedir(), '.claude');

export const TARGETS = {
  agents: join(claudeBase, 'agents'),
  rules: join(claudeBase, 'rules'),
  skills: join(claudeBase, 'skills'),
  servers: join(claudeBase, 'servers'),
  standards: join(claudeBase, 'standards'),
  scripts: join(claudeBase, 'scripts'),
  mcpSettings: join(homedir(), '.claude.json'),
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

/**
 * Map an agent's `tools` list to Claude Code's built-in tool names.
 *
 * Claude Code splits file modification into two separate built-in tools —
 * `Write` (create/overwrite) and `Edit` (in-place modification) — where
 * ai-foundation models both as a single generic `write` tool. We don't
 * define a separate generic `edit` tool, so `write` expands to both Claude
 * Code tools here; agents granted `write` need to be able to edit existing
 * files, not just create new ones.
 *
 * @param {string[]} tools
 * @returns {string[]}
 */
export function mapAgentTools(tools) {
  return tools.flatMap((name) => (name === TOOLS.WRITE ? ['Write', 'Edit'] : [mapToolName(name)]));
}

// --- blocked_commands → PreToolUse hook ---

/**
 * Name of the shared hook resource, used as the manifest key and as the
 * lib/harnesses/assets/{name}/ source directory name.
 */
export const BLOCK_COMMAND_RESOURCE = 'block-command';

/**
 * Source directory (within this repo's lib/) for the shared block-command
 * hook script.
 */
const HOOK_SCRIPT_SRC_DIR = join(__dirname, 'assets', BLOCK_COMMAND_RESOURCE);

/**
 * Resolve the installed path of the hook CLI entry point.
 * @returns {string}
 */
function hookScriptPath() {
  return join(TARGETS.scripts, BLOCK_COMMAND_RESOURCE, 'cli.js');
}

/**
 * Quote a single command-line argument for safe inclusion in the hook
 * `command` string (handles spaces and embedded double quotes).
 * @param {string} value
 * @returns {string}
 */
function quoteArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/**
 * Build the shell command string for a PreToolUse hook that blocks the
 * given patterns.
 *
 * Uses `process.execPath` (the absolute path to the Node binary running
 * `aif install` itself) rather than the bare `node` command. Claude Code
 * may execute hook commands through a shell whose PATH doesn't resolve
 * `node` (e.g. a minimal /usr/bin/bash on Windows) — the absolute path
 * removes that dependency entirely, on any OS.
 *
 * @param {string[]} patterns
 * @returns {string}
 */
function buildHookCommand(patterns) {
  const args = [hookScriptPath(), ...patterns].map(quoteArg);
  return `${quoteArg(process.execPath)} ${args.join(' ')}`;
}

/**
 * Determine whether an agent requires the shared block-command hook script.
 * Called from base.js's installAgents() loop, where each agent is already
 * parsed — this is the harness-specific half of shared-resource detection.
 * @param {import('../component-defs.js').AgentDef} agent - Parsed agent YAML object
 * @returns {string|null} The shared resource name, or null if not needed
 */
export function detectSharedResource(agent) {
  if (Array.isArray(agent.blocked_commands) && agent.blocked_commands.length > 0) {
    return BLOCK_COMMAND_RESOURCE;
  }
  return null;
}

/**
 * Install the shared block-command hook script (logic.js + cli.js) to
 * ~/.claude/scripts/block-command/. Only called when at least one installed
 * agent needs it (see detectSharedResource) — its manifest entry tracks
 * which bundles depend on it, so it is removed once none do
 * (see lib/commands/uninstall.js).
 * @param {string} _repoRoot - Unused (source lives alongside this adapter)
 * @returns {Array<{path: string, hash: string}>} Manifest entries
 */
export function installBlockCommandResource(_repoRoot) {
  const installed = [];
  const targetDir = join(TARGETS.scripts, BLOCK_COMMAND_RESOURCE);
  for (const file of ['logic.js', 'cli.js']) {
    const src = join(HOOK_SCRIPT_SRC_DIR, file);
    const content = readFileSync(src);
    writeToTarget(join(targetDir, file), content);
    installed.push({ path: join(targetDir, file), hash: hashContent(content) });
  }
  console.log(`  ✓ hook script: ${BLOCK_COMMAND_RESOURCE}`);
  return installed;
}

// --- Transform functions ---

/**
 * Transform an ai-foundation agent YAML into Claude Code's markdown agent format.
 * @param {import('../component-defs.js').AgentDef} agent - Parsed agent YAML object
 * @returns {string} Markdown with YAML frontmatter
 */
export function transformAgent(agent) {
  const tools = mapAgentTools(agent.tools || []);

  const frontmatter = {
    name: agent.name,
    description: agent.description,
    tools: tools.join(', '),
  };

  // Enforce blocked shell commands via a PreToolUse hook on the Bash tool.
  // (Claude Code subagent frontmatter has no `permissions` field — only a
  // hook can actually intercept and block specific command patterns.)
  if (Array.isArray(agent.blocked_commands) && agent.blocked_commands.length > 0) {
    frontmatter.hooks = {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: buildHookCommand(agent.blocked_commands),
            },
          ],
        },
      ],
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
 * Get skill sources for Claude Code (full directory tree — SKILL.md plus
 * any reference/, assets/, scripts/ subdirectories). Claude Code natively
 * supports the directory-based skill format: ~/.claude/skills/{name}/SKILL.md
 * with optional bundled subdirectories alongside it.
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

// --- MCP server installation ---

/**
 * Install an MCP server with stdio transport for Claude Code.
 * Copies runtime files to ~/.claude/servers/{name}/, runs npm install,
 * and registers the server (user scope) in ~/.claude.json.
 *
 * @param {string} name - Server folder name
 * @param {import('../component-defs.js').ServerDef} serverDef - Parsed server YAML definition
 * @param {string} repoRoot - Absolute path to the repository root
 * @returns {Array<{path: string, hash: string}>} Manifest entries
 */
function installMcpStdio(name, serverDef, repoRoot) {
  const installed = [];
  const serverSrcDir = join(repoRoot, 'servers', name);
  const serverTargetDir = join(TARGETS.servers, name);

  // Collect runtime files (exclude tests/ and .test.js files)
  const allFiles = collectFiles(serverSrcDir);
  const runtimeFiles = allFiles.filter((f) => !f.startsWith('tests/') && !f.endsWith('.test.js'));

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

  // Register in ~/.claude.json
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
 * Resolve "${ENV_VAR_NAME}" placeholders in header values against an
 * environment map. Server yaml files are committed to the repo, so header
 * values must never contain literal secrets — they reference an env var
 * name instead (mirrors .aiconfig.json's ai_identity.git_token_env
 * pattern), and this resolves that reference at install time.
 *
 * Pure function — takes the headers object and an env map in, returns a
 * new resolved object out. Defaults env to process.env for normal use;
 * callers (and tests) may pass an explicit map instead.
 *
 * @param {Record<string, string>} headers - Header name -> value, values may contain ${VAR} placeholders
 * @param {Record<string, string>} [env=process.env] - Environment map to resolve against
 * @returns {Record<string, string>} Headers with placeholders resolved
 * @throws {Error} If a referenced variable is not set in env
 */
export function resolveHeaderPlaceholders(headers, env = process.env) {
  const resolved = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') {
      resolved[key] = value;
      continue;
    }
    resolved[key] = value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, varName) => {
      const envValue = env[varName];
      if (envValue === undefined) {
        throw new Error(`references unset environment variable ${varName}`);
      }
      return envValue;
    });
  }
  return resolved;
}

/**
 * Install an MCP server with HTTP transport for Claude Code.
 * No files to copy — just registers the server URL (user scope) in ~/.claude.json.
 *
 * @param {string} name - Server folder name
 * @param {import('../component-defs.js').ServerDef} serverDef - Parsed server YAML definition
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
    try {
      mcpEntry.headers = resolveHeaderPlaceholders(serverDef.headers);
    } catch (err) {
      console.error(`  ✗ server "${name}" header error: ${err.message}`);
      return installed;
    }
  }

  mergeMcpSettings(name, mcpEntry);

  console.log(`  ✓ server: ${name} (mcp/http)`);
  return installed;
}

/**
 * Read, merge, and write an entry into the MCP settings file.
 * Creates the file if it doesn't exist. Preserves any other top-level keys
 * already present in the file (e.g. Claude Code's own config state).
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
 * @param {import('../component-defs.js').ServerDef} serverDef - Parsed server YAML
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
  detectSharedResource,
  sharedResourceInstallers: {
    [BLOCK_COMMAND_RESOURCE]: installBlockCommandResource,
  },
});

// --- Re-export adapter install methods and shared utilities ---

export const installAgents = adapter.installAgents;
export const installSteering = adapter.installSteering;
export const installSkills = adapter.installSkills;
export const installServers = adapter.installServers;
export const installSharedResources = adapter.installSharedResources;
export const installStandards = adapter.installStandards;
export { parseFrontmatter } from './base.js';
