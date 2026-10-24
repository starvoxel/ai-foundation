/**
 * Pure logic for project initialization.
 * No I/O — provides validation and content transformation.
 */

/**
 * Validate project name for use as a directory name.
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateProjectName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Project name is required' };
  }

  if (name.trim() !== name) {
    return { valid: false, error: 'Project name must not have leading or trailing spaces' };
  }

  if (/[<>:"/\\|?*]/.test(name)) {
    return { valid: false, error: 'Project name contains invalid characters' };
  }

  if (name.startsWith('.') || name.startsWith('_')) {
    return { valid: false, error: 'Project name must not start with . or _' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'Project name must be 100 characters or fewer' };
  }

  return { valid: true };
}

/**
 * Validate a project short name for use in Feature IDs and worktree paths.
 * Short names keep IDs (e.g. `MYAPP-001`) and worktree paths readable
 * even when the full project name is long.
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateProjectShortname(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Project short name is required' };
  }

  if (name.trim() !== name) {
    return { valid: false, error: 'Project short name must not have leading or trailing spaces' };
  }

  if (/[<>:"/\\|?*]/.test(name)) {
    return { valid: false, error: 'Project short name contains invalid characters' };
  }

  if (name.startsWith('.') || name.startsWith('_')) {
    return { valid: false, error: 'Project short name must not start with . or _' };
  }

  if (name.length > 5) {
    return { valid: false, error: 'Project short name must be 5 characters or fewer' };
  }

  return { valid: true };
}

/**
 * @typedef {Object} ProjectConfig
 * @property {string} [projectName] - Project name
 * @property {string} [projectShortname] - Short project identifier used in Feature IDs and
 *   worktree paths. Falls back to projectName when not provided.
 * @property {string} [language] - Primary language; seeds the standards tags when `standards` is not given
 * @property {string[]} [standards] - Standards tags to wire into .aiconfig.json
 */

/**
 * Apply all project substitutions to file content.
 * Replaces template placeholders with actual values.
 * Unfilled placeholders are left as-is for manual completion.
 * @param {string} content - File content from the template
 * @param {ProjectConfig} config - Project configuration values
 * @returns {string} Content with substitutions applied
 */
export function applyProjectConfig(content, config) {
  let result = content;

  if (config.projectName) {
    result = result.replace(/\{ProjectName\}/g, config.projectName);
    result = result.replace(/my-project/g, config.projectName);
  }

  const shortname = config.projectShortname || config.projectName;
  if (shortname) {
    result = result.replace(/\{ProjectShortName\}/g, shortname);
  }

  return result;
}

/**
 * Build the .aiconfig.json content with project configuration.
 * @param {ProjectConfig} config - Project configuration values
 * @returns {string} JSON string for .aiconfig.json
 */
export function buildAiConfig(config) {
  const shortname = config.projectShortname || config.projectName || '';
  // `--language` is shorthand for a standards tag (csharp, javascript, ...).
  const tags = config.standards ?? (config.language ? [config.language.toLowerCase()] : []);

  const aiconfig = {
    project_name: config.projectName || '',
    project_shortname: shortname,
    standards: {
      engineering: tags,
      all: [],
    },
    paths: {
      plans: 'plans',
      knowledge: 'knowledge',
      architecture: 'knowledge/architecture',
      research: 'knowledge/research',
      product: 'knowledge/product',
    },
    oversight: { default: 'by-size', enforced: false },
  };

  return JSON.stringify(aiconfig, null, 2) + '\n';
}
