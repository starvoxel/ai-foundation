/**
 * pr-watch — review/comment normalization and triage (pure).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * Turns GitHub review, review-comment, and issue-comment objects into
 * metadata-only items (never the body text, every third-party string
 * sanitized) and splits the unhandled ones into "act" (permitted actor: the
 * agent evaluates the request) and "escalate" (everyone else: report once,
 * never act). Actor decisions come only from `actors.js`.
 *
 * Own-comment handling (`self`): the caller names the login the agent acts
 * as. Items by that login are recorded as handled and not reported. When
 * `self` is not given, the PR author's comments (which may be the agent's
 * own) are held back as `escalate` with reason `self_unset_author`, never
 * treated as permitted requests and never dropped silently. When `self`
 * equals the caller's `human`, own-skipping is off (the agent and the human
 * share an account) and the digest warns instead.
 */

import { classifyActor, normalizeLogin } from './actors.js';
import {
  sanitizeAssociation,
  sanitizeId,
  sanitizeLogin,
  sanitizeReviewState,
  sanitizeUrl,
  sanitizeVersion,
} from './sanitize.js';

/** @typedef {'review'|'review_comment'|'issue_comment'} FeedbackKind */

/**
 * @typedef {object} FeedbackItem
 * @property {string} key - `kind:id`
 * @property {FeedbackKind} kind
 * @property {number} id
 * @property {string|null} login - Sanitized; null when absent or not login-shaped
 * @property {string|null} association - A documented value or null
 * @property {string|null} type
 * @property {string} version - Last edit marker (`updated_at`, else `submitted_at`); an edit changes it
 * @property {string|null} url
 * @property {string|null} reviewState - Review state for a review, else null
 */

/**
 * Reduce one API object to sanitized metadata. Body text is deliberately dropped.
 * @param {FeedbackKind} kind
 * @param {any} obj
 * @returns {FeedbackItem|null} null when the object has no usable id
 */
export function normalizeFeedback(kind, obj) {
  const id = obj && typeof obj === 'object' ? sanitizeId(obj.id) : null;
  if (id === null) return null;
  const user = obj.user && typeof obj.user === 'object' ? obj.user : null;
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    login: sanitizeLogin(user?.login),
    association: sanitizeAssociation(obj.author_association),
    type: user?.type === 'Bot' || user?.type === 'User' ? user.type : null,
    version: sanitizeVersion(obj.updated_at ?? obj.submitted_at),
    url: sanitizeUrl(obj.html_url),
    reviewState: kind === 'review' ? sanitizeReviewState(obj.state) : null,
  };
}

/**
 * The REST path to read one item's text through `ai-git gh-api`.
 * @param {FeedbackKind} kind
 * @param {string} repo
 * @param {number|null} pr
 * @param {number} id
 * @returns {string|null}
 */
export function apiPath(kind, repo, pr, id) {
  if (kind === 'review') return pr === null ? null : `repos/${repo}/pulls/${pr}/reviews/${id}`;
  if (kind === 'review_comment') return `repos/${repo}/pulls/comments/${id}`;
  return `repos/${repo}/issues/comments/${id}`;
}

/**
 * @typedef {object} TriagedItem
 * @property {string} key
 * @property {FeedbackKind} kind
 * @property {number} id
 * @property {string|null} login
 * @property {string|null} association
 * @property {string|null} url
 * @property {string|null} api_path - Read the item's text with `ai-git gh-api <api_path>`
 * @property {string|null} review_state
 * @property {string} reason - Actor-classification reason code
 * @property {boolean} edited - Seen before with a different edit marker
 */

/**
 * @typedef {import('./actors.js').ActorContext & {self?: string|null, repo: string, pr: number|null}} TriageContext
 */

/**
 * The one decision used for every feedback actor, by `check` and by the
 * `classify` command alike: `own` (the caller-named self, skipped),
 * `escalate` or `permitted`. With `self` unset the PR author is held back
 * as `escalate` (`self_unset_author`); with `self` equal to `human`
 * nothing is treated as own.
 * @param {import('./actors.js').ActorMeta} actor
 * @param {import('./actors.js').ActorContext & {self?: string|null}} context
 * @returns {{verdict: 'permitted'|'escalate'|'own', reason: string}}
 */
export function decideActor(actor, context) {
  const self = normalizeLogin(context.self);
  const human = normalizeLogin(context.human);
  const author = normalizeLogin(context.prAuthor);
  const login = normalizeLogin(actor?.login);
  if (self !== null && self !== human && login === self) return { verdict: 'own', reason: 'self' };
  if (self === null && login !== null && login === author && login !== human) {
    return { verdict: 'escalate', reason: 'self_unset_author' };
  }
  return classifyActor(actor, context);
}

/**
 * @param {FeedbackItem[]} items
 * @param {Record<string, string>} handled - key to version already acted on, answered, or escalated
 * @param {TriageContext} context
 * @returns {{act: TriagedItem[], escalate: TriagedItem[], ownKeys: Record<string, string>}}
 *   `ownKeys` are the agent's own items, to be recorded as handled without reporting
 */
export function triageFeedback(items, handled, context) {
  /** @type {TriagedItem[]} */
  const act = [];
  /** @type {TriagedItem[]} */
  const escalate = [];
  /** @type {Record<string, string>} */
  const ownKeys = {};
  for (const item of items) {
    const seen = Object.hasOwn(handled, item.key) ? handled[item.key] : undefined;
    if (seen === item.version) continue;
    const { verdict, reason } = decideActor(
      { login: item.login, association: item.association, type: item.type },
      context,
    );
    if (verdict === 'own') {
      ownKeys[item.key] = item.version;
      continue;
    }
    /** @type {TriagedItem} */
    const out = {
      key: item.key,
      kind: item.kind,
      id: item.id,
      login: item.login,
      association: item.association,
      url: item.url,
      api_path: apiPath(item.kind, context.repo, context.pr, item.id),
      review_state: item.reviewState,
      reason,
      edited: seen !== undefined,
    };
    (verdict === 'permitted' ? act : escalate).push(out);
  }
  return { act, escalate, ownKeys };
}
