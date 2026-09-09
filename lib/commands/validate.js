/**
 * validate command — checks repo health: schemas, cross-references, bundle resolution.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

import { SOURCE_DIRS } from '../constants.js';
import { resolveBundle, listBundles } from '../resolver.js';

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;

/**
 * Run the validate command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runValidate(parsed, repoRoot) {
  const target = parsed.positional[0];
  const checks = {
    schema: validateSchemas,
    refs: validateRefs,
    bundles: validateBundles,
  };

  if (target && !checks[target]) {
    console.error(`Unknown validate target: ${target}. Use: schema, refs, bundles`);
    return 1;
  }

  const toRun = target ? { [target]: checks[target] } : checks;
  let totalErrors = 0;

  for (const [name, fn] of Object.entries(toRun)) {
    const errors = fn(repoRoot);
    if (errors.length === 0) {
      console.log(`✓ ${name}`);
    } else {
      console.log(`✗ ${name} (${errors.length} errors)`);
      for (const err of errors) {
        console.log(`    ${err}`);
      }
      totalErrors += errors.length;
    }
  }

  if (totalErrors > 0) {
    console.log(`\n${totalErrors} validation error(s) found.`);
    return 1;
  }

  console.log('\nAll validations passed.');
  return 0;
}

// --- Schema validation ---

function validateSchemas(repoRoot) {
  const errors = [];
  errors.push(...validateAgentSchemas(repoRoot));
  errors.push(...validateSkillSchemas(repoRoot));
  errors.push(...validateSteeringSchemas(repoRoot));
  errors.push(...validateBundleSchemas(repoRoot));
  return errors;
}

function validateAgentSchemas(repoRoot) {
  const errors = [];
  const dir = join(repoRoot, SOURCE_DIRS.agents);
  if (!existsSync(dir)) return errors;

  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml') && !f.startsWith('_'));
  for (const file of files) {
    const path = join(dir, file);
    const agent = parseYaml(path);
    if (!agent) {
      errors.push(`${file}: invalid YAML`);
      continue;
    }

    const name = file.replace(/\.yaml$/, '');
    if (!agent.name) errors.push(`${file}: missing 'name'`);
    else if (agent.name !== name)
      errors.push(`${file}: name '${agent.name}' doesn't match filename`);
    else if (!KEBAB_CASE.test(agent.name)) errors.push(`${file}: name is not kebab-case`);

    if (!agent.version) errors.push(`${file}: missing 'version'`);
    else if (!SEMVER.test(agent.version)) errors.push(`${file}: invalid semver '${agent.version}'`);

    if (!agent.domain) errors.push(`${file}: missing 'domain'`);
    if (!agent.description) errors.push(`${file}: missing 'description'`);
    if (!agent.prompt) errors.push(`${file}: missing 'prompt'`);
    if (!Array.isArray(agent.tools)) errors.push(`${file}: missing or invalid 'tools'`);
    if (!Array.isArray(agent.approved_tools))
      errors.push(`${file}: missing or invalid 'approved_tools'`);

    if (Array.isArray(agent.tools) && Array.isArray(agent.approved_tools)) {
      for (const tool of agent.approved_tools) {
        if (!agent.tools.includes(tool)) {
          errors.push(`${file}: approved_tool '${tool}' not in tools`);
        }
      }
    }
  }
  return errors;
}

function validateSkillSchemas(repoRoot) {
  const errors = [];
  const dir = join(repoRoot, SOURCE_DIRS.skills);
  if (!existsSync(dir)) return errors;

  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);

  for (const folder of folders) {
    const skillPath = join(dir, folder, 'SKILL.md');
    if (!existsSync(skillPath)) {
      errors.push(`skills/${folder}: missing SKILL.md`);
      continue;
    }

    const content = readFileSync(skillPath, 'utf8');
    const fm = extractFrontmatter(content);
    if (!fm) {
      errors.push(`skills/${folder}/SKILL.md: missing or invalid frontmatter`);
      continue;
    }

    if (!fm.name) errors.push(`skills/${folder}/SKILL.md: missing 'name'`);
    else if (fm.name !== folder)
      errors.push(`skills/${folder}/SKILL.md: name '${fm.name}' doesn't match folder`);
    else if (!KEBAB_CASE.test(fm.name))
      errors.push(`skills/${folder}/SKILL.md: name is not kebab-case`);

    if (!fm.version) errors.push(`skills/${folder}/SKILL.md: missing 'version'`);
    else if (!SEMVER.test(fm.version)) errors.push(`skills/${folder}/SKILL.md: invalid semver`);

    if (!fm.description) errors.push(`skills/${folder}/SKILL.md: missing 'description'`);
  }
  return errors;
}

function validateSteeringSchemas(repoRoot) {
  const errors = [];
  const dir = join(repoRoot, SOURCE_DIRS.steering);
  if (!existsSync(dir)) return errors;

  const files = collectMdFilesFlat(dir);
  for (const relPath of files) {
    const fullPath = join(dir, relPath);
    const content = readFileSync(fullPath, 'utf8');
    const fm = extractFrontmatter(content);
    if (!fm) {
      errors.push(`steering/${relPath}: missing or invalid frontmatter`);
      continue;
    }

    if (!fm.name) errors.push(`steering/${relPath}: missing 'name'`);
    else if (!KEBAB_CASE.test(fm.name)) errors.push(`steering/${relPath}: name is not kebab-case`);

    if (!fm.version) errors.push(`steering/${relPath}: missing 'version'`);
    else if (!SEMVER.test(fm.version)) errors.push(`steering/${relPath}: invalid semver`);

    if (!fm.description) errors.push(`steering/${relPath}: missing 'description'`);
  }
  return errors;
}

function validateBundleSchemas(repoRoot) {
  const errors = [];
  const dir = join(repoRoot, SOURCE_DIRS.bundles);
  if (!existsSync(dir)) return errors;

  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml') && !f.startsWith('_'));
  for (const file of files) {
    const path = join(dir, file);
    const bundle = parseYaml(path);
    if (!bundle) {
      errors.push(`bundles/${file}: invalid YAML`);
      continue;
    }

    if (!bundle.name) errors.push(`bundles/${file}: missing 'name'`);
    if (!bundle.version) errors.push(`bundles/${file}: missing 'version'`);
    else if (!SEMVER.test(bundle.version)) errors.push(`bundles/${file}: invalid semver`);
    if (!bundle.description) errors.push(`bundles/${file}: missing 'description'`);
  }
  return errors;
}

// --- Cross-reference validation ---

function validateRefs(repoRoot) {
  const errors = [];
  const agentsDir = join(repoRoot, SOURCE_DIRS.agents);
  if (!existsSync(agentsDir)) return errors;

  const files = readdirSync(agentsDir).filter((f) => f.endsWith('.yaml') && !f.startsWith('_'));
  for (const file of files) {
    const agent = parseYaml(join(agentsDir, file));
    if (!agent) continue;

    // Check skills exist
    if (Array.isArray(agent.skills)) {
      for (const ref of agent.skills) {
        const name = ref.startsWith('skill/') ? ref.slice('skill/'.length) : ref;
        const skillDir = join(repoRoot, SOURCE_DIRS.skills, name);
        if (!existsSync(skillDir)) {
          errors.push(`${file}: skill '${ref}' references non-existent folder skills/${name}/`);
        }
      }
    }

    // Check domain has steering
    if (agent.domain) {
      const domainDir = join(repoRoot, SOURCE_DIRS.steering, agent.domain);
      if (!existsSync(domainDir)) {
        errors.push(
          `${file}: domain '${agent.domain}' has no matching steering/${agent.domain}/ directory`,
        );
      }
    }
  }
  return errors;
}

// --- Bundle resolution validation ---

function validateBundles(repoRoot) {
  const errors = [];
  const bundles = listBundles(repoRoot);

  for (const name of bundles) {
    try {
      resolveBundle(name, repoRoot);
    } catch (err) {
      errors.push(`bundles/${name}/bundle.yaml: ${err.message}`);
    }
  }
  return errors;
}

// --- Helpers ---

function parseYaml(filePath) {
  try {
    return YAML.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return YAML.parse(match[1]);
  } catch {
    return null;
  }
}

function collectMdFilesFlat(dir, prefix = '') {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    if (entry.name === 'README.md') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectMdFilesFlat(join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.md')) {
      results.push(rel);
    }
  }
  return results;
}
