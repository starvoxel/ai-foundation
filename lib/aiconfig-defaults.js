/**
 * Default values for .aiconfig.json fields — the code-owned source of truth
 * for the "Defaults (when .aiconfig.json is absent)" table in AGENTS.md.
 * AGENTS.md's prose table must stay in sync with this file, not the other
 * way around: this is what lib/aiconfig.js actually resolves against.
 *
 * Keys are dotted field paths matching .aiconfig.json's own shape (e.g.
 * "paths.decisions"), matching how AGENTS.md's field table already names
 * them.
 *
 * A default is either a literal value, or a function `(ctx) => value` for
 * fields whose default derives from another field's *resolved* value
 * rather than a fixed constant — e.g. paths.decisions defaults to
 * "{paths.knowledge}/decisions", which must follow a configured
 * paths.knowledge override, not stay hardcoded to "knowledge/decisions".
 */

import { basename } from 'node:path';

/**
 * @typedef {object} DefaultCtx
 * @property {string} projectRoot - Absolute path to the project repo root.
 * @property {(keyPath: string) => *} get - Resolve another field's value
 *   (its configured value if set, else its own default). Used to express
 *   defaults that derive from another field.
 */

export const DEFAULTS = {
  project_name: (ctx) => basename(ctx.projectRoot),
  project_shortname: (ctx) => ctx.get('project_name'),
  repo_type: 'project',

  'paths.plans': 'plans',
  'paths.epics': 'plans/epics',
  'paths.chunks': 'plans/chunks',
  'paths.knowledge': 'knowledge',
  'paths.decisions': (ctx) => `${ctx.get('paths.knowledge')}/decisions`,
  'paths.orchestration': 'plans/orchestration',
  'paths.worktrees': (ctx) => `../worktrees/${ctx.get('project_shortname')}`,

  'orchestration.max_concurrent': 4,
};
