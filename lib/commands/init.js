/**
 * init command — scaffolds a new project directory for use with ai-foundation agents.
 *
 * Usage:
 *   aif init --name <project-name>          — create ./project-name/ with full scaffold
 *   aif init --name <project-name> --force  — overwrite if directory already exists
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateProjectManifest, validateProjectName } from '../project-init.js';

/**
 * Run the init command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} _repoRoot - Unused (init creates relative to cwd)
 * @returns {number} exit code
 */
export function runInit(parsed, _repoRoot) {
  const name = parsed.args.name;
  const force = Boolean(parsed.args.force);

  if (!name || typeof name !== 'string') {
    console.error('Missing required option: --name <project-name>');
    return 1;
  }

  const validation = validateProjectName(name);
  if (!validation.valid) {
    console.error(`Invalid project name: ${validation.error}`);
    return 1;
  }

  const projectDir = join(process.cwd(), name);

  if (existsSync(projectDir) && !force) {
    console.error(`Directory already exists: ${projectDir}`);
    console.error('Use --force to overwrite.');
    return 1;
  }

  const { dirs, files } = generateProjectManifest(name);

  // Create directories
  for (const dir of dirs) {
    mkdirSync(join(projectDir, dir), { recursive: true });
  }

  // Write files
  for (const file of files) {
    const filePath = join(projectDir, file.path);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, file.content, 'utf8');
  }

  // Create .gitkeep files for empty directories
  for (const dir of dirs) {
    const dirPath = join(projectDir, dir);
    const keepFile = join(dirPath, '.gitkeep');
    if (!existsSync(keepFile)) {
      writeFileSync(keepFile, '', 'utf8');
    }
  }

  console.log(`✓ Project "${name}" initialized at ./${name}/`);
  return 0;
}
