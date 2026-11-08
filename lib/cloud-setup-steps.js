/**
 * Pure formatting of the "set up a Claude Code cloud environment" steps that
 * `aif init` prints after scaffolding a project. The Setup script text itself is owned
 * by scripts/cloud-setup-bootstrap.sh, which the README links to; this module only frames it.
 * Environment variable names are listed, never values.
 */

/** Environment variables the cloud environment needs, with what each is for. */
export const CLOUD_ENV_VARS = [
  {
    name: 'GIT_CONFIG_GLOBAL',
    value: '/dev/null',
    purpose: 'makes a raw `git commit` fail instead of using the harness identity',
  },
  {
    name: 'BWS_PROJECT_ID',
    value: '<project id>',
    purpose: 'Bitwarden Secrets Manager project holding the ai-git token (not a secret)',
  },
  {
    name: 'BWS_ACCESS_TOKEN',
    value: '<machine-account token>',
    purpose: 'token for that project; the one credential, scope it to the ai-git secrets only',
  },
];

/**
 * Build the steps text.
 * @param {object} options
 * @param {string} options.bootstrap - Contents of scripts/cloud-setup-bootstrap.sh
 * @param {string} options.readmePath - Path to ai-foundation's README, for details
 * @param {boolean} options.bundlesInstalled - Whether init already installed the default bundles
 * @returns {string} Text ending in a newline
 */
export function formatCloudSetupSteps({ bootstrap, readmePath, bundlesInstalled }) {
  const vars = CLOUD_ENV_VARS.map((v) => `       ${v.name}=${v.value}\n         ${v.purpose}`).join(
    '\n',
  );
  const bundleStep = bundlesInstalled
    ? '  3. Commit the project-scope install in .claude/ so the engineer agent starts from turn 1.'
    : [
        '  3. Commit a project-scope install so the engineer agent starts from turn 1:',
        '       aif install --scope project -B engineering -H claude',
      ].join('\n');

  return [
    '',
    'Cloud setup (Claude Code on the web), once per environment:',
    '',
    "  1. Paste this into the environment's Setup script:",
    '',
    '  --- start of script (flush left, copy exactly) ---',
    bootstrap.trimEnd(),
    '  --- end of script ---',
    '',
    "  2. Set these in the environment's variables (never in the script):",
    '',
    vars,
    '',
    bundleStep,
    '',
    '  4. Optional: to start repos as another agent, uncomment the `export AIF_AGENT=<name>`',
    '     line in the Setup script and bump `# rev:`.',
    '',
    `Details, limits and a verification checklist: ${readmePath} ("Claude Code Cloud").`,
    '',
  ].join('\n');
}
