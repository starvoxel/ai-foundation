/**
 * Shared test fixture — creates and destroys temporary repo directories.
 *
 * Usage:
 *   import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';
 *
 *   let repo;
 *   beforeEach(() => { repo = createTempRepo({ agents: [...], ... }); });
 *   afterEach(() => { destroyTempRepo(repo); });
 *
 * For tests that only need a bare temp directory (no repo structure):
 *   let repo;
 *   beforeEach(() => { repo = createTempRepo(); });
 *   afterEach(() => { destroyTempRepo(repo); });
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';

/**
 * Creates a temporary directory, optionally scaffolded as a repo.
 *
 * @param {object} [options] - If omitted, creates a bare temp directory.
 * @param {Array<object>} [options.agents]   - Agent objects to write (must have `name` field).
 * @param {string[]}      [options.skills]   - Skill folder names to create.
 * @param {object}        [options.steering] - Map of scope → filenames, e.g. { global: ['core.md'] }
 * @param {string[]}      [options.servers]  - Server folder names to create.
 * @param {Array<object>} [options.bundles]  - Bundle objects to write (must have `name` field).
 * @returns {string} Absolute path to the temp directory.
 */
export function createTempRepo(options) {
  const root = mkdtempSync(join(tmpdir(), 'aif-test-'));

  if (!options) return root;

  const { agents = [], skills = [], steering = {}, servers = [], bundles = [] } = options;

  // Create base directories
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'skills'), { recursive: true });
  mkdirSync(join(root, 'steering', 'global'), { recursive: true });
  mkdirSync(join(root, 'servers'), { recursive: true });
  mkdirSync(join(root, 'bundles'), { recursive: true });

  for (const agent of agents) {
    writeFileSync(
      join(root, 'agents', `${agent.name}.yaml`),
      YAML.stringify(agent),
      'utf8'
    );
  }

  for (const skill of skills) {
    const dir = join(root, 'skills', skill);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `# ${skill}\n`, 'utf8');
  }

  for (const [scope, files] of Object.entries(steering)) {
    const dir = join(root, 'steering', scope);
    mkdirSync(dir, { recursive: true });
    for (const file of files) {
      writeFileSync(join(dir, file), `# ${file}\n`, 'utf8');
    }
  }

  for (const server of servers) {
    const dir = join(root, 'servers', server);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${server}.yaml`),
      YAML.stringify({
        name: server,
        version: '0.1.0',
        protocol: 'mcp',
        transport: 'stdio',
        description: `${server} server`,
        tools: [],
      }),
      'utf8'
    );
  }

  for (const bundle of bundles) {
    writeFileSync(
      join(root, 'bundles', `${bundle.name}.yaml`),
      YAML.stringify(bundle),
      'utf8'
    );
  }

  return root;
}

/**
 * Removes a temp directory created by createTempRepo.
 * @param {string} root - Path returned by createTempRepo.
 */
export function destroyTempRepo(root) {
  rmSync(root, { recursive: true, force: true });
}
