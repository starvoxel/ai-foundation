/**
 * Oversight level resolution — how much human sign-off the engineer agent
 * waits for. Pure logic: the `aif oversight` command (lib/commands/oversight.js)
 * supplies the configured values and any level the human asked for in their
 * prompt; `skill/oversight` defines what each level means in practice.
 *
 * Levels, lowest to highest: none | by-size | always. A prompt may override
 * the configured default unless `.aiconfig.json` marks it enforced, in which
 * case a request can only raise the level, never lower it.
 */

export const OVERSIGHT_LEVELS = ['none', 'by-size', 'always'];

/**
 * @param {unknown} value
 * @returns {value is 'none'|'by-size'|'always'}
 */
export function isOversightLevel(value) {
  return typeof value === 'string' && OVERSIGHT_LEVELS.includes(value);
}

/**
 * Resolve the effective oversight level.
 * @param {{ configured: unknown, enforced: unknown, requested?: string|undefined }} input
 *   `configured` is `oversight.default`; `enforced` is `oversight.enforced`;
 *   `requested` is the level the human asked for in their prompt, if any.
 * @returns {{ level: string, source: 'config'|'request', note?: string }}
 * @throws {Error} When `configured` or `requested` is not a valid level
 */
export function resolveOversight({ configured, enforced, requested }) {
  if (!isOversightLevel(configured)) {
    throw new Error(
      `Invalid oversight.default "${configured}". Use one of: ${OVERSIGHT_LEVELS.join(', ')}`,
    );
  }
  if (requested === undefined) return { level: configured, source: 'config' };
  if (!isOversightLevel(requested)) {
    throw new Error(
      `Invalid oversight level "${requested}". Use one of: ${OVERSIGHT_LEVELS.join(', ')}`,
    );
  }

  const lowered = OVERSIGHT_LEVELS.indexOf(requested) < OVERSIGHT_LEVELS.indexOf(configured);
  if (enforced === true && lowered) {
    return {
      level: configured,
      source: 'config',
      note: `Requested "${requested}" ignored: oversight is enforced at "${configured}" and a request can only raise it.`,
    };
  }
  return { level: requested, source: 'request' };
}
