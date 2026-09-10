import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

// Full semver per semver.org: MAJOR.MINOR.PATCH[-prerelease][+build]
export const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
export const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Resolve the repository root from a given starting path.
 */
export function repoRoot(fromDir) {
  return join(fromDir, '..');
}

/**
 * Parse a YAML file and return the result.
 * Returns null if the file doesn't exist.
 */
export function parseYaml(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf-8');
  return YAML.parse(content);
}

/**
 * Get all agent .yaml files (excludes _template.yaml).
 */
export function getAgentFiles(agentsDir) {
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir).filter((f) => f.endsWith('.yaml') && f !== '_template.yaml');
}

/**
 * Get all server folder names (excludes _template/).
 */
export function getServerFolders(serversDir) {
  if (!existsSync(serversDir)) return [];
  return readdirSync(serversDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_template')
    .map((d) => d.name);
}

/**
 * Get all skill folder names (excludes _template/).
 */
export function getSkillFolders(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_template')
    .map((d) => d.name);
}

/**
 * Collect all tool names declared across all server definitions.
 */
export function getAllServerToolNames(serversDir) {
  const toolNames = new Set();
  for (const folder of getServerFolders(serversDir)) {
    const yamlPath = join(serversDir, folder, `${folder}.yaml`);
    const parsed = parseYaml(yamlPath);
    if (parsed && Array.isArray(parsed.tools)) {
      for (const tool of parsed.tools) {
        if (tool.name) toolNames.add(tool.name);
      }
    }
  }
  return toolNames;
}

/**
 * Collect tool names grouped by server name.
 * @returns {Map<string, Set<string>>} server name → set of tool names
 */
export function getServerToolMap(serversDir) {
  const map = new Map();
  for (const folder of getServerFolders(serversDir)) {
    const yamlPath = join(serversDir, folder, `${folder}.yaml`);
    const parsed = parseYaml(yamlPath);
    if (parsed && Array.isArray(parsed.tools)) {
      const tools = new Set();
      for (const tool of parsed.tools) {
        if (tool.name) tools.add(tool.name);
      }
      map.set(folder, tools);
    }
  }
  return map;
}
