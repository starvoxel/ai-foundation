/**
 * pr-watch — permitted-actor classification (pure).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * The single definition of who may trigger a change during a PR pass or
 * watch. Used identically for objects polled from the GitHub API and for
 * metadata supplied by a wake source (a cloud notification's author fields),
 * so the wake mechanism never changes the decision. Only structured API
 * author metadata is read — never comment text.
 */

import { asciiLower } from './sanitize.js';

/** `author_association` values that make an actor permitted (exact, upper case). */
export const PERMITTED_ASSOCIATIONS = Object.freeze(['OWNER', 'MEMBER', 'COLLABORATOR']);

/**
 * @typedef {object} ActorMeta
 * @property {string|null|undefined} login - API author login (`user.login`); null/absent for a deleted account
 * @property {string|null|undefined} association - API `author_association`
 * @property {string|null|undefined} [type] - API `user.type` ("User", "Bot", ...)
 */

/**
 * @typedef {object} ActorContext
 * @property {string|null|undefined} prAuthor - The PR author's login, from the PR object
 * @property {string|null|undefined} [human] - Login of the human who started the watch, supplied by the caller (never by PR content)
 */

/**
 * @typedef {object} ActorVerdict
 * @property {'permitted'|'escalate'} verdict
 * @property {string} reason - Stable machine-readable reason code
 */

/**
 * @param {unknown} value
 * @returns {string|null} The login folded to ASCII lower case (GitHub logins are case-insensitive; non-ASCII look-alikes are never folded onto ASCII), or null when not a usable string
 */
export function normalizeLogin(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return asciiLower(value);
}

/**
 * @param {ActorMeta} actor
 * @returns {boolean} True for a bot account (API type, or the `[bot]` login suffix)
 */
export function isBot(actor) {
  const login = typeof actor.login === 'string' ? asciiLower(actor.login) : '';
  return actor.type === 'Bot' || login.endsWith('[bot]');
}

/**
 * Classify one actor. Permitted when the PR author, the human who started
 * the watch, or (for a non-bot) a repo OWNER/MEMBER/COLLABORATOR. Everyone
 * else — bots without a login match, deleted accounts, missing metadata —
 * is "escalate": reported once to the caller and never acted on.
 * @param {ActorMeta|null|undefined} actor
 * @param {ActorContext} context
 * @returns {ActorVerdict}
 */
export function classifyActor(actor, context) {
  if (!actor || typeof actor !== 'object') return { verdict: 'escalate', reason: 'no_author' };
  const login = normalizeLogin(actor.login);
  if (login === null) return { verdict: 'escalate', reason: 'no_author' };

  const prAuthor = normalizeLogin(context?.prAuthor);
  if (prAuthor !== null && login === prAuthor) return { verdict: 'permitted', reason: 'pr_author' };

  const human = normalizeLogin(context?.human);
  if (human !== null && login === human) return { verdict: 'permitted', reason: 'human' };

  if (isBot(actor)) return { verdict: 'escalate', reason: 'bot' };
  if (PERMITTED_ASSOCIATIONS.includes(/** @type {string} */ (actor.association))) {
    return { verdict: 'permitted', reason: 'association' };
  }
  return { verdict: 'escalate', reason: 'not_permitted' };
}
