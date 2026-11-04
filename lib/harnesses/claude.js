// ------------------------------
// claude.js
//
// Author: Starvoxel AI Agent - 2026-10-02
// Plan: AIF-010
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Claude Code harness adapter — transforms and installs ai-foundation components
 * into Claude Code's native formats and locations.
 *
 * Global scope (default): targets live under the user's home directory,
 * matching Claude Code's native "personal" (user-scope) locations — agents and
 * skills at ~/.claude/{agents,skills}, and user-scope MCP servers registered in
 * ~/.claude.json (NOT ~/.claude/mcp.json, which Claude Code silently ignores).
 *
 * Project scope (`enterScope('project', root)`): the same layout under
 * <root>/.claude/, MCP servers in <root>/.mcp.json, and nothing that embeds a
 * machine-specific path, so the output can be committed.
 */

import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import YAML from 'yaml';

import {
  createAdapter,
  stripSkillPrefix,
  resolvePreloadSkills,
  resolveTools,
  mapSingleTool,
  MCP_TOOL_REF,
  UNSUPPORTED,
} from './base.js';
import { parseFrontmatter, collectFiles, writeToTarget, hashContent } from '../file-utils.js';
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

// --- Install scope ---

/** True while targets point at a project (see enterScope). */
let isProjectScope = false;

/** Project-relative standards directory, written into project-scope rules. */
const PROJECT_STANDARDS_REF = '.claude/standards';

/**
 * Target paths for a project-scope install.
 * @param {string} projectRoot - Absolute project root
 * @returns {typeof TARGETS}
 */
export function projectTargets(projectRoot) {
  const base = join(projectRoot, '.claude');
  return {
    agents: join(base, 'agents'),
    rules: join(base, 'rules'),
    skills: join(base, 'skills'),
    servers: join(base, 'servers'),
    standards: join(base, 'standards'),
    scripts: join(base, 'scripts'),
    mcpSettings: join(projectRoot, '.mcp.json'),
  };
}

/**
 * Point this adapter at a scope until the returned function is called.
 * Global scope leaves the current targets untouched.
 * @param {'global'|'project'} scope
 * @param {string} projectRoot - Absolute project root (used for project scope)
 * @returns {() => void} Restores the previous targets and scope
 */
export function enterScope(scope, projectRoot) {
  const saved = { ...TARGETS };
  const wasProjectScope = isProjectScope;
  if (scope === 'project') {
    Object.assign(TARGETS, projectTargets(projectRoot));
    isProjectScope = true;
  }
  return () => {
    Object.assign(TARGETS, saved);
    isProjectScope = wasProjectScope;
  };
}

/**
 * Standards directory as written into rules: absolute for global scope,
 * project-relative for project scope.
 * @returns {string}
 */
function standardsRef() {
  return isProjectScope ? PROJECT_STANDARDS_REF : TARGETS.standards;
}

// --- Tool name map ---

/**
 * Native names of claude-code-remote platform tools (the same
 * `mcp__<server>__<tool>` form `mapMcpToolRef` produces).
 * @param {...string} tools - Bare claude-code-remote tool names
 * @returns {string[]}
 */
const ccr = (...tools) => tools.map((t) => `mcp__claude-code-remote__${t}`);

/**
 * Maps ai-foundation generic tool names to Claude Code's built-in tool
 * names. Each value is an array — some generic tools expand to a cluster of
 * native tools that are always granted together (e.g. `write` needs both
 * `Write`, for create/overwrite, and `Edit`, for in-place modification,
 * since we don't define a separate generic `edit` tool).
 *
 * `UNSUPPORTED` (shared marker, base.js) means Claude Code has no native
 * equivalent yet. This is a deliberate, verified "nothing to add", reported
 * as dropped at install — never guess a plausible-sounding
 * native name here. An invented name is silently dropped by Claude Code at
 * install time (no error), so it would look supported but grant nothing;
 * `code` was mapped to a non-existent `LSP` tool for exactly this reason
 * before being corrected. Every name below must be checked against
 * `KNOWN_NATIVE_TOOLS` in tests/unit/claude-adapter.test.js.
 */
export const TOOL_MAP = {
  [TOOLS.READ]: ['Read'],
  [TOOLS.WRITE]: ['Write', 'Edit'],
  [TOOLS.SHELL]: ['Bash'],
  [TOOLS.WEB_SEARCH]: ['WebSearch'],
  [TOOLS.WEB_FETCH]: ['WebFetch'],
  [TOOLS.GREP]: ['Grep'],
  [TOOLS.GLOB]: ['Glob'],
  // No native code-navigation/LSP tool exists in Claude Code. Falls back to
  // whatever `read`/`grep`/`glob` the agent already has. A real fix would be
  // a code-nav MCP server, not a tool-name guess.
  [TOOLS.CODE]: UNSUPPORTED,
  // Spawn, enumerate, and follow up with dispatched subagents — used together
  // to dispatch a subagent, then check on or message it later.
  [TOOLS.SUBAGENT]: ['Agent', 'ListAgents', 'SendMessage'],
  [TOOLS.PLAN]: ['EnterPlanMode', 'ExitPlanMode'],
  [TOOLS.ASK_USER]: ['AskUserQuestion'],
  // `TaskOutput` is deliberately absent: Claude Code removed it (its own docs
  // mark it deprecated in favor of `Read` on the task's output file, and the
  // CLI silently ignores it), so listing it would grant nothing.
  [TOOLS.TASK]: ['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskStop'],
  [TOOLS.SKILL]: ['Skill'],

  // Platform-tool groups: clusters of claude-code-remote tools,
  // granted all together or not at all. Tier per group: see constants.js.
  [TOOLS.SESSION_INFO]: ccr('read_documentation', 'get_session'),
  // `ReadNotifications` is a core (non-MCP) tool: PR events after
  // `subscription.created` arrive only as queued notifications it reads
  // (verification-guide.md A3b; plan Q10). Shared members are deduped by the
  // resolver. It is deliberately not in the other wake-delivering groups:
  // `send_later` and `send_message` wakes reached an agent without it (A3a,
  // A3c), and `CronCreate`/`ScheduleWakeup`/`watch_url` are not assumed to
  // use the queue. Add it to a group only once its need is verified.
  [TOOLS.PR_FOLLOW_THROUGH]: [
    ...ccr('subscribe_pr_activity', 'unsubscribe_pr_activity', 'send_later'),
    'ReadNotifications',
  ],
  [TOOLS.REPO_LIST]: ccr('list_repos'),
  [TOOLS.SESSION_CONTROL]: ccr(
    'list_sessions',
    'list_events',
    'get_event',
    'create_session',
    'send_message',
    'interrupt_session',
    'set_session_title',
    'set_session_tags',
  ),
  [TOOLS.REPO_SCOPE]: ccr('add_repo', 'register_repo_root'),
  // Names confirmed against a real Claude Code cloud session tool listing
  // (2026-10-03, human-verified). Note `list_triggers` is plural.
  [TOOLS.ROUTINES]: ccr(
    'create_trigger',
    'update_trigger',
    'delete_trigger',
    'fire_trigger',
    'get_trigger',
    'list_triggers',
    'watch_url',
    'unwatch_url',
  ),
};

// --- Tool mapping ---

/** Resolver inputs shared by every mapping helper below. */
const resolverConfig = { toolMap: TOOL_MAP, mapRef: mapMcpToolRef };

/**
 * Map a single tool name from our format to Claude Code's format. Returns
 * the first native name in the tool's cluster, the native `mcp__server__tool`
 * name for an `@server/tool` reference, or `null` for a tool with no native
 * equivalent (never the generic name). A bare unknown name throws. A
 * convenience for single-name lookups (tests, logging) — `mapAgentTools` is
 * the authoritative expansion used at install time.
 * @param {string} name
 * @returns {string|null}
 * @throws {import('./base.js').UnknownToolError}
 */
export function mapToolName(name) {
  return mapSingleTool(name, resolverConfig);
}

/**
 * Map an agent's tool list to Claude Code's built-in tool names, expanding
 * each generic tool to its full native cluster, deduplicated. A tool with no
 * native equivalent contributes nothing. An `@server/tool` reference is
 * rewritten to `mcp__server__tool`. Any other name throws.
 *
 * @param {string[]} tools
 * @param {string[]} [dropped] - Receives the names dropped as unsupported
 * @returns {string[]}
 * @throws {import('./base.js').UnknownToolError}
 */
export function mapAgentTools(tools, dropped = []) {
  const result = resolveTools(tools, resolverConfig);
  dropped.push(...result.dropped);
  return result.tools;
}

/**
 * Rewrite a generic `@server/tool` MCP reference to Claude Code's native
 * `mcp__<server>__<tool>` name. Claude Code replaces every character outside
 * `[A-Za-z0-9_-]` in the server and tool parts with `_` when it builds these
 * names. A value that is not a well-formed `@server/tool` reference is
 * returned unchanged.
 *
 * @param {string} name - A tool name from an agent's `tools` list
 * @returns {string} The native MCP tool name, or `name` unchanged
 */
export function mapMcpToolRef(name) {
  const match = MCP_TOOL_REF.exec(name);
  if (!match) return name;
  const clean = (part) => part.replace(/[^A-Za-z0-9_-]/g, '_');
  return `mcp__${clean(match[1])}__${clean(match[2])}`;
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

/** Hook CLI entry point as referenced from a committed project-scope agent. */
export const PROJECT_HOOK_SCRIPT = `\${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}/.claude/scripts/${BLOCK_COMMAND_RESOURCE}/cli.js`;

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
 * Project scope instead uses bare `node` and `$CLAUDE_PROJECT_DIR` (expanded
 * by the hook's shell inside the double quotes), since a committed file must
 * not carry the installing machine's paths. Claude Code's docs do not say the
 * variable is set for agent-frontmatter hooks (two issues report it empty), so
 * the git top-level is the fallback. Trade-offs: a shell without `node` on PATH
 * cannot run the hook, and neither can one outside a git work tree with the
 * variable unset; either way the hook exits non-2, which Claude Code treats as
 * "allow", so the command runs unblocked.
 *
 * @param {string[]} patterns
 * @returns {string}
 */
function buildHookCommand(patterns) {
  if (isProjectScope) {
    return ['node', ...[PROJECT_HOOK_SCRIPT, ...patterns].map(quoteArg)].join(' ');
  }
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
 * @param {string[]} [dropped] - Receives the tool names dropped as unsupported
 * @returns {string} Markdown with YAML frontmatter
 * @throws {import('./base.js').UnknownToolError}
 */
export function transformAgent(agent, dropped = []) {
  const tools = mapAgentTools(agent.tools || [], dropped);
  // approved_tools has no Claude frontmatter field; resolve it anyway so an
  // unknown name fails loudly and a dropped one is reported.
  const approvedDropped = [];
  mapAgentTools(agent.approved_tools || [], approvedDropped);
  for (const name of approvedDropped) if (!dropped.includes(name)) dropped.push(name);

  const frontmatter = {
    name: agent.name,
    description: agent.description,
    tools: tools.join(', '),
  };

  // Preload the subset of `skills` named in `preload_skills` (or all of
  // them, for the `["*"]` sentinel) into this subagent's context at
  // startup. Everything else in `skills` stays reachable only via the
  // `Skill` tool on demand — see resolvePreloadSkills for why the default
  // (preload_skills absent) is "preload nothing," not "preload all."
  const preloadSkills = resolvePreloadSkills(agent).map(stripSkillPrefix);
  if (preloadSkills.length > 0) {
    frontmatter.skills = preloadSkills;
  }

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
    return content.replace(/\{\{standards_path\}\}/g, standardsRef());
  }

  const filePatterns = frontmatter.file_patterns;
  if (Array.isArray(filePatterns) && filePatterns.length > 0) {
    const claudeFrontmatter = { paths: filePatterns };
    const yamlStr = YAML.stringify(claudeFrontmatter).trim();
    const resolvedBody = body.replace(/\{\{standards_path\}\}/g, standardsRef());
    return `---\n${yamlStr}\n---\n${resolvedBody}`;
  }

  // No file_patterns or empty = always loaded = no frontmatter needed
  return body.replace(/\{\{standards_path\}\}/g, standardsRef());
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

/** Launcher copied into each project-scope stdio server's directory. */
const MCP_LAUNCHER_FILE = 'aif-launch.mjs';
const MCP_LAUNCHER_SRC = join(__dirname, 'mcp-launch', MCP_LAUNCHER_FILE);

/**
 * `.mcp.json` entry for a project-scope stdio server. Claude Code does not
 * expand `${CLAUDE_PROJECT_DIR}` in `.mcp.json` args, but sets it in the
 * server's environment, so `node -e` resolves the launcher path at start
 * (falling back to the working directory). Nothing machine-specific is written.
 * @param {string} name - Server name
 * @returns {{command: string, args: string[]}}
 */
export function projectStdioEntry(name) {
  const segments = ['.claude', 'servers', name, MCP_LAUNCHER_FILE].map((s) => JSON.stringify(s));
  const path = `require('node:path').join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), ${segments.join(', ')})`;
  return {
    command: 'node',
    args: ['-e', `import(require('node:url').pathToFileURL(${path}).href).then((m) => m.launch())`],
  };
}

/**
 * Install an MCP server with stdio transport for Claude Code. Copies runtime
 * files to TARGETS.servers/{name}/. Global scope runs npm install there and
 * registers the absolute entry point in ~/.claude.json; project scope adds the
 * launcher and a .gitignore instead and registers projectStdioEntry() in
 * <project>/.mcp.json, leaving dependencies to the server's first start.
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
  const runtimeFiles = allFiles.filter(
    (f) => !f.startsWith('tests/') && !f.startsWith('node_modules/') && !f.endsWith('.test.js'),
  );

  // Copy runtime files to target
  for (const relPath of runtimeFiles) {
    const src = join(serverSrcDir, relPath);
    const targetPath = join(serverTargetDir, relPath);
    const content = readFileSync(src);
    writeToTarget(targetPath, content);
    installed.push({ path: targetPath, hash: hashContent(content) });
  }

  if (isProjectScope) {
    // Committed without node_modules: the launcher installs dependencies on the
    // server's first start (see mcp-launch/aif-launch.mjs for why not SessionStart).
    for (const [file, content] of [
      [MCP_LAUNCHER_FILE, readFileSync(MCP_LAUNCHER_SRC, 'utf8')],
      ['.gitignore', 'node_modules/\n.aif-install.lock\n'],
    ]) {
      const targetPath = join(serverTargetDir, file);
      writeToTarget(targetPath, content);
      installed.push({ path: targetPath, hash: hashContent(content) });
    }
    mergeMcpSettings(name, projectStdioEntry(name));
    console.log(`  ✓ server: ${name} (mcp/stdio, dependencies install on first start)`);
    return installed;
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
    // Passed through unresolved, matching kiro.js's installMcpHttp:
    // Claude Code itself expands "${VAR_NAME}" placeholders from its own
    // process environment at connect time (confirmed live — see
    // docs/plans/secrets-resolution-plan.md's Key Findings), so no
    // secret value needs to be present during `aif install`, and none is
    // ever written into ~/.claude.json.
    mcpEntry.headers = serverDef.headers;
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
 * @returns {Array<{path: string, hash: string}>|null} Manifest entries, or null when skipped
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
  harness: 'claude',
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
export { parseFrontmatter } from '../file-utils.js';
