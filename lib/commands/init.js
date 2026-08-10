/**
 * init command — scaffolds a new project by copying the template directory
 * and applying project name substitution.
 *
 * Usage:
 *   aif init --name <project-name>          — create ./project-name/ from template
 *   aif init --name <project-name> --force  — overwrite if directory already exists
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateProjectName, applyProjectName } from '../project-init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_DIR = resolve(__dirname, '..', '..', 'projects', '_template');

/**
 * Recursively copy a directory, applying name substitution to file contents.
 * @param {string} srcDir - Source directory (template)
 * @param {string} destDir - Destination directory (new project)
 * @param {string} projectName - Name to substitute
 */
function copyTemplate(srcDir, destDir, projectName) {
  const entries = readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyTemplate(srcPath, destPath, projectName);
    } else {
      const content = readFileSync(srcPath, 'utf8');
      const transformed = applyProjectName(content, projectName);
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, transformed, 'utf8');
    }
  }
}

/**
 * Run the init command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} _repoRoot - Unused
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

  mkdirSync(projectDir, { recursive: true });
  copyTemplate(TEMPLATE_DIR, projectDir, name);

  console.log(`✓ Project "${name}" initialized at ./${name}/`);
  return 0;
}
