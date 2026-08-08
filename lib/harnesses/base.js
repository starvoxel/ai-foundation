/**
 * Base harness adapter — shared install logic for all harness adapters.
 *
 * Each harness provides a config object with its targets, tool map, and
 * transform functions. This module provides the generic install orchestration
 * that reads sources, delegates to transforms, writes outputs, and returns
 * manifest-ready records.
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';

// --- Shared utilities ---

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

/**
 * SHA-256 hash with prefix.
 * @param {string|Buffer} content
 * @returns {string}
 */
export function hashContent(content) {
  const data = typeof content === 'string' ? content : content.toString('utf8');
  return 'sha256:' + createHash('sha256').update(data).digest('hex');
}

/**
 * Write content to a target path, creating directories as needed.
 * @param {string} filePath
 * @param {string|Buffer} content
 */
export function writeToTarget(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Recursively collect all files in a directory, returning paths relative to dir.
 * Skips directories named '_template'.
 * @param {string} dir
 * @param {string} [prefix='']
 * @returns {string[]}
 */
export function collectFiles(dir, prefix = '') {
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

// --- Adapter factory ---

/**
 * @typedef {object} HarnessConfig
 * @property {Record<string, string>} targets - Mutable target path map
 * @property {Record<string, string>} toolMap - Generic→harness tool name map
 * @property {(agent: object) => string|object} transformAgent - Agent YAML → output content
 * @property {(content: string) => string} transformSteering - Steering md → output content
 * @property {string} agentExt - File extension for agents (e.g. '.json', '.md')
 * @property {string} steeringDir - Key in targets for steering output (e.g. 'steering', 'rules')
 * @property {(skillName: string, repoRoot: string) => Array<{src: string, targetPath: string}>} getSkillSources
 * @property {Record<string, (serverName: string, serverDef: object, repoRoot: string) => Array<{path: string, hash: string}>>} [serverInstallers] - Protocol → installer function map
 */

/**
 * Create a harness adapter with standard install methods.
 *
 * Each adapter provides its own self-contained transformAgent/transformSteering that
 * already close over their own TOOL_MAP. The base just orchestrates the read/write loop.
 *
 * @param {HarnessConfig} config
 * @returns {object} Adapter with installAgents, installSteering, installSkills, installServers
 */
export function createAdapter(config) {
  const { targets, transformAgent, transformSteering, agentExt, steeringDir, getSkillSources, serverInstallers } = config;

  function installAgents(agentFiles, repoRoot) {
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

      const targetPath = join(targets.agents, `${agent.name}${agentExt}`);
      const outputStr = typeof output === 'object' ? JSON.stringify(output, null, 2) : output;
      writeToTarget(targetPath, outputStr);
      installed.push({ path: targetPath, hash: hashContent(outputStr) });
      console.log(`  ✓ agent: ${agent.name}`);
    }

    return installed;
  }

  function installSteering(steeringPaths, repoRoot) {
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
      const targetPath = join(targets[steeringDir], targetName);
      writeToTarget(targetPath, transformed);
      installed.push({ path: targetPath, hash: hashContent(transformed) });
      console.log(`  ✓ ${steeringDir === 'rules' ? 'rule' : 'steering'}: ${targetName}`);
    }

    return installed;
  }

  function installSkills(skillNames, repoRoot) {
    const installed = [];

    for (const skillName of skillNames) {
      const sources = getSkillSources(skillName, repoRoot);
      for (const { src, targetPath } of sources) {
        if (!existsSync(src)) {
          console.error(`  ✗ skill source not found: ${skillName}`);
          continue;
        }
        const content = readFileSync(src);
        writeToTarget(targetPath, content);
        installed.push({ path: targetPath, hash: hashContent(content) });
      }
      if (sources.length > 0) {
        console.log(`  ✓ skill: ${skillName}`);
      }
    }

    return installed;
  }

  function installServers(serverNames, repoRoot) {
    const installed = [];

    for (const name of serverNames) {
      const yamlPath = join(repoRoot, 'servers', name, `${name}.yaml`);
      if (!existsSync(yamlPath)) {
        console.error(`  ✗ server definition not found: ${name}`);
        continue;
      }

      const content = readFileSync(yamlPath, 'utf8');
      const serverDef = YAML.parse(content);

      if (!serverDef || !serverDef.protocol) {
        console.error(`  ✗ server "${name}" has no protocol field`);
        continue;
      }

      if (!serverInstallers || !serverInstallers[serverDef.protocol]) {
        console.log(`  ⊘ server: ${name} (protocol "${serverDef.protocol}" not supported by this harness)`);
        continue;
      }

      const installer = serverInstallers[serverDef.protocol];
      const files = installer(name, serverDef, repoRoot);
      installed.push(...files);
    }

    return installed;
  }

  function installStandards(standardsFiles, repoRoot) {
    const installed = [];

    for (const file of standardsFiles) {
      const srcPath = join(repoRoot, 'standards', file);
      if (!existsSync(srcPath)) {
        console.error(`  ✗ standards source not found: ${file}`);
        continue;
      }
      const content = readFileSync(srcPath, 'utf8');
      const targetPath = join(targets.standards, file);
      writeToTarget(targetPath, content);
      installed.push({ path: targetPath, hash: hashContent(content) });
      console.log(`  ✓ standard: ${file.replace(/\.md$/, '')}`);
    }

    return installed;
  }

  return {
    installAgents,
    installSteering,
    installSkills,
    installServers,
    installStandards,
  };
}
