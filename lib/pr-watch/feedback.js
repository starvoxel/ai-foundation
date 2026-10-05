/**
 * pr-watch — review/comment normalization and triage (pure).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * Turns GitHub review, review-comment, and issue-comment objects into
 * metadata-only items (never the body text) and splits the unhandled ones
 * into "act" (permitted actor: the agent evaluates the request) and
 * "escalate" (everyone else: report once, never act). Actor decisions come
 * only from `actors.js`.
 */

import { classifyActor } from './actors.js';

/** @typedef {'review'|'review_comment'|'issue_comment'} FeedbackKind */

/**
 * @typedef {object} FeedbackItem
 * @property {string} key - `kind:id`
 * @property {FeedbackKind} kind
 * @property {number|string} id
 * @property {string|null} login
 * @property {string|null} association
 * @property {string|null} type
 * @property {string} version - Last edit marker (`updated_at`, else `submitted_at`); an edit changes it
 * @property {string|null} url
 * @property {string|null} reviewState - Review state for a review, else null
 */

/**
 * Reduce one API object to metadata. Body text is deliberately dropped.
 * @param {FeedbackKind} kind
 * @param {any} obj
 * @returns {FeedbackItem|null} null when the object has no usable id
 */
export function normalizeFeedback(kind, obj) {
  if (!obj || (typeof obj.id !== 'number' && typeof obj.id !== 'string')) return null;
  const user = obj.user && typeof obj.user === 'object' ? obj.user : null;
  return {
    key: `${kind}:${obj.id}`,
    kind,
    id: obj.id,
    login: typeof user?.login === 'string' ? user.login : null,
    association: typeof obj.author_association === 'string' ? obj.author_association : null,
    type: typeof user?.type === 'string' ? user.type : null,
    version: String(obj.updated_at ?? obj.submitted_at ?? ''),
    url: typeof obj.html_url === 'string' ? obj.html_url : null,
    reviewState: kind === 'review' && typeof obj.state === 'string' ? obj.state : null,
  };
}

/**
 * @typedef {object} TriagedItem
 * @property {string} key
 * @property {FeedbackKind} kind
 * @property {number|string} id
 * @property {string|null} login
 * @property {string|null} association
 * @property {string|null} url
 * @property {string|null} review_state
 * @property {string} reason - Actor-classification reason code
 * @property {boolean} edited - Seen before with a different edit marker
 */

/**
 * @param {FeedbackItem[]} items
 * @param {Record<string, string>} handled - key to version already acted on, answered, or escalated
 * @param {import('./actors.js').ActorContext & {self?: string|null}} context
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
  const self = typeof context.self === 'string' ? context.self.toLowerCase() : null;

  for (const item of items) {
    const seen = handled[item.key];
    if (seen === item.version) continue;
    if (self !== null && typeof item.login === 'string' && item.login.toLowerCase() === self) {
      ownKeys[item.key] = item.version;
      continue;
    }
    const { verdict, reason } = classifyActor(
      { login: item.login, association: item.association, type: item.type },
      context,
    );
    /** @type {TriagedItem} */
    const out = {
      key: item.key,
      kind: item.kind,
      id: item.id,
      login: item.login,
      association: item.association,
      url: item.url,
      review_state: item.reviewState,
      reason,
      edited: seen !== undefined,
    };
    (verdict === 'permitted' ? act : escalate).push(out);
  }
  return { act, escalate, ownKeys };
}
