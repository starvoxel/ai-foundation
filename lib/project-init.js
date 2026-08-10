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
 * Apply project name substitution to file content.
 * Replaces template placeholders with the actual project name.
 * @param {string} content - File content from the template
 * @param {string} projectName - The actual project name
 * @returns {string} Content with substitutions applied
 */
export function applyProjectName(content, projectName) {
  return content
    .replace(/\{ProjectName\}/g, projectName)
    .replace(/my-project/g, projectName);
}
