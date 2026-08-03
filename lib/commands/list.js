/**
 * list command — list available bundles, agents, skills, or servers
 * by scanning source directories.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

import { SOURCE_DIRS } from '../constants.js';
import { listBundles } from '../resolver.js';

/**
 * Run the list command.
 * @param {{ args: Record<string, string>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runList(parsed, repoRoot) {
  const target = parsed.positional[0];

  if (!target) {
    console.error('Usage: aif list <bundles|agents|skills|servers>');
    return 1;
  }

  switch (target) {
    case 'bundles':
      return listBundlesCmd(repoRoot);
    case 'agents':
      return listAgents(repoRoot);
    case 'skills':
      return listSkills(repoRoot);
    case 'servers':
      return listServers(repoRoot);
    default:
      console.error(`Unknown list target: ${target}. Use: bundles, agents, skills, servers`);
      return 1;
  }
}

function listBundlesCmd(repoRoot) {
  const bundles = listBundles(repoRoot);
  if (bundles.length === 0) {
    console.log('No bundles found.');
    return 0;
  }
  console.log('Bundles:');
  for (const name of bundles) {
    const desc = getDescription(join(repoRoot, SOURCE_DIRS.bundles, `${name}.yaml`));
    console.log(`  ${name}${desc ? ` — ${desc}` : ''}`);
  }
  return 0;
}

function listAgents(repoRoot) {
  const dir = join(repoRoot, SOURCE_DIRS.agents);
  const files = getYamlFiles(dir);
  if (files.length === 0) {
    console.log('No agents found.');
    return 0;
  }
  console.log('Agents:');
  for (const file of files) {
    const desc = getDescription(join(dir, file));
    const name = file.replace(/\.yaml$/, '');
    console.log(`  ${name}${desc ? ` — ${desc}` : ''}`);
  }
  return 0;
}

function listSkills(repoRoot) {
  const dir = join(repoRoot, SOURCE_DIRS.skills);
  const folders = getSkillFolders(dir);
  if (folders.length === 0) {
    console.log('No skills found.');
    return 0;
  }
  console.log('Skills:');
  for (const name of folders) {
    const skillPath = join(dir, name, 'SKILL.md');
    const desc = getMdDescription(skillPath);
    console.log(`  ${name}${desc ? ` — ${desc}` : ''}`);
  }
  return 0;
}

function listServers(repoRoot) {
  const dir = join(repoRoot, SOURCE_DIRS.servers);
  const folders = getServerFolders(dir);
  if (folders.length === 0) {
    console.log('No servers found.');
    return 0;
  }
  console.log('Servers:');
  for (const name of folders) {
    const desc = getDescription(join(dir, name, `${name}.yaml`));
    console.log(`  ${name}${desc ? ` — ${desc}` : ''}`);
  }
  return 0;
}

// --- Helpers ---

function getYamlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.yaml') && !f.startsWith('_'));
}

function getSkillFolders(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name);
}

function getServerFolders(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name);
}

function getDescription(yamlPath) {
  if (!existsSync(yamlPath)) return null;
  try {
    const content = readFileSync(yamlPath, 'utf8');
    const parsed = YAML.parse(content);
    return parsed?.description || null;
  } catch {
    return null;
  }
}

function getMdDescription(mdPath) {
  if (!existsSync(mdPath)) return null;
  try {
    const content = readFileSync(mdPath, 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    const fm = YAML.parse(match[1]);
    return fm?.description || null;
  } catch {
    return null;
  }
}
