/**
 * pr-watch — sanitizers for third-party strings (pure).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * Everything in a digest that came from GitHub (logins, check names, URLs)
 * is attacker-influenced on a repo that accepts outside contributions. These
 * functions shrink each such value to a safe, bounded shape before it can
 * reach a digest, a summary line, or a state file. Anything that does not fit
 * becomes null (identifiers) or is stripped and truncated (free text).
 */

/** Longest free-text value (a check name) carried into a digest. */
export const MAX_TEXT = 80;

/** `author_association` values GitHub documents. */
export const ASSOCIATIONS = Object.freeze([
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
  'CONTRIBUTOR',
  'FIRST_TIMER',
  'FIRST_TIME_CONTRIBUTOR',
  'MANNEQUIN',
  'NONE',
]);

const REVIEW_STATES = Object.freeze([
  'APPROVED',
  'CHANGES_REQUESTED',
  'COMMENTED',
  'DISMISSED',
  'PENDING',
]);

/**
 * ASCII-only lower-casing. `String.prototype.toLowerCase` also folds
 * non-ASCII look-alikes (the Kelvin sign U+212A lowers to `k`), which would
 * let a forged login compare equal to a real one.
 * @param {string} value
 * @returns {string}
 */
export function asciiLower(value) {
  return value.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * Strip control characters (including ESC and C1 controls) and line
 * separators, collapse whitespace, and truncate.
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
export function sanitizeText(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return '';
  // Controls and line separators become spaces; invisible format characters (bidi
  // overrides and isolates, zero-width, tag characters), private-use, unassigned
  // and surrogate code points are removed outright. Display trade-off: removing
  // ZWJ/ZWNJ (format characters) splits joined emoji and some scripts' ligatures
  // into their parts; the text stays readable and nothing invisible can remain.
  const spaced = value.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ');
  const cleaned = spaced.replace(/[\p{Cf}\p{Co}\p{Cn}\p{Cs}]/gu, '');
  const squeezed = cleaned.replace(/\s+/g, ' ').trim();
  // Truncate by code point so an astral character is never split into a lone surrogate.
  const points = [...squeezed];
  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : squeezed;
}

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/;

/**
 * @param {unknown} value
 * @returns {string|null} The login when it has GitHub's login shape, else null
 */
export function sanitizeLogin(value) {
  return typeof value === 'string' && LOGIN_RE.test(value) ? value : null;
}

/**
 * @param {unknown} value
 * @returns {string|null} A documented `author_association`, else null
 */
export function sanitizeAssociation(value) {
  return typeof value === 'string' && ASSOCIATIONS.includes(value) ? value : null;
}

/**
 * @param {unknown} value
 * @returns {string|null} A documented review state, else null
 */
export function sanitizeReviewState(value) {
  return typeof value === 'string' && REVIEW_STATES.includes(value) ? value : null;
}

const URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_./#?&=%-]{1,280}$/;

/**
 * @param {unknown} value
 * @returns {string|null} A github.com https URL of safe shape, else null
 */
export function sanitizeUrl(value) {
  return typeof value === 'string' && URL_RE.test(value) ? value : null;
}

/**
 * @param {unknown} value
 * @returns {number|null} A positive safe integer id (number or digit string), else null
 */
export function sanitizeId(value) {
  const n = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * @param {unknown} value
 * @returns {string} A timestamp-ish edit marker of safe shape, else an empty string
 */
export function sanitizeVersion(value) {
  return typeof value === 'string' && /^[0-9TZ:+.-]{1,40}$/.test(value) ? value : '';
}
