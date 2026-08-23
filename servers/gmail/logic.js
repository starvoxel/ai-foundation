/**
 * Gmail MCP server — tool implementations.
 *
 * Split per steering/engineering/core.md Rule 6 (design for testability):
 * pure functions (MIME building, base64url encoding, response shaping) take
 * data in and return data out with no side effects. I/O functions are thin
 * wrappers that call the injected Gmail API client and pass results through
 * the pure shaping functions. Every I/O function takes `gmail` (a
 * `googleapis` `gmail_v1.Gmail` instance) as its first argument so tests can
 * inject a fake client instead of hitting the network.
 *
 * Plan ID: docs/plans/gmail-mcp-server-plan.md
 */

// ── Pure Logic: encoding ────────────────────────────────────────────────────

/**
 * Base64url-encode a UTF-8 string (Gmail API's required encoding for the
 * `raw` field of a message).
 * @param {string} str
 * @returns {string}
 */
export function encodeBase64Url(str) {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Convert Gmail's base64url attachment data to standard base64, so callers
 * receive a widely-usable encoding.
 * @param {string} base64url
 * @returns {string}
 */
export function base64UrlToBase64(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('base64');
}

// ── Pure Logic: MIME message building ───────────────────────────────────────

/**
 * Build an RFC 2822 plain-text email as a raw header+body string.
 * @param {{ to: string[], subject: string, body: string, cc?: string[], bcc?: string[], inReplyTo?: string, references?: string }} fields
 * @returns {string}
 */
export function buildMimeMessage({ to, subject, body, cc = [], bcc = [], inReplyTo, references }) {
  if (!Array.isArray(to) || to.length === 0) {
    throw new Error('"to" must be a non-empty array of email addresses');
  }
  const headers = [
    `To: ${to.join(', ')}`,
  ];
  if (cc.length) headers.push(`Cc: ${cc.join(', ')}`);
  if (bcc.length) headers.push(`Bcc: ${bcc.join(', ')}`);
  headers.push(`Subject: ${subject || ''}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);
  return `${headers.join('\r\n')}\r\n\r\n${body || ''}`;
}

/**
 * Build the base64url-encoded `raw` field Gmail's send/create-draft APIs expect.
 * @param {Parameters<typeof buildMimeMessage>[0]} fields
 * @returns {string}
 */
export function buildRawMessage(fields) {
  return encodeBase64Url(buildMimeMessage(fields));
}

/**
 * Derive the reply subject line, prefixing "Re: " only if not already present.
 * @param {string} originalSubject
 * @returns {string}
 */
export function buildReplySubject(originalSubject = '') {
  return /^re:/i.test(originalSubject.trim()) ? originalSubject : `Re: ${originalSubject}`;
}

// ── Pure Logic: response shaping ────────────────────────────────────────────

/**
 * Find a header value by name (case-insensitive) from a Gmail payload's
 * headers array.
 * @param {{ name: string, value: string }[]} headers
 * @param {string} name
 * @returns {string}
 */
export function getHeader(headers = [], name) {
  const found = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return found ? found.value : '';
}

/**
 * Recursively walk a Gmail message payload to extract plain-text body,
 * HTML body, and attachment metadata.
 * @param {object} payload - Gmail API message.payload
 * @returns {{ body_text: string, body_html: string, attachments: { attachment_id: string, filename: string, mime_type: string, size: number }[] }}
 */
export function extractBodyAndAttachments(payload) {
  let bodyText = '';
  let bodyHtml = '';
  const attachments = [];

  function walk(part) {
    if (!part) return;
    const mimeType = part.mimeType || '';
    const filename = part.filename || '';

    if (filename && part.body?.attachmentId) {
      attachments.push({
        attachment_id: part.body.attachmentId,
        filename,
        mime_type: mimeType,
        size: part.body.size || 0,
      });
    } else if (mimeType === 'text/plain' && part.body?.data) {
      bodyText += base64UrlToUtf8(part.body.data);
    } else if (mimeType === 'text/html' && part.body?.data) {
      bodyHtml += base64UrlToUtf8(part.body.data);
    }

    for (const child of part.parts || []) {
      walk(child);
    }
  }

  walk(payload);
  return { body_text: bodyText, body_html: bodyHtml, attachments };
}

/**
 * Decode Gmail's base64url body data to a UTF-8 string.
 * @param {string} base64url
 * @returns {string}
 */
export function base64UrlToUtf8(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

// ── Pure Logic: filter criteria/action shaping ──────────────────────────────
// Plan ID: docs/plans/gmail-filter-and-batch-tools-plan.md

/**
 * Build the Gmail API's `criteria` object from the tool's snake_case inputs.
 * Undefined fields are omitted rather than sent as null/false.
 * @param {{ from?: string, to?: string, subject?: string, query?: string, negated_query?: string, has_attachment?: boolean, exclude_chats?: boolean, size?: number, size_comparison?: 'larger'|'smaller'|'unspecified' }} params
 * @returns {object}
 */
export function buildFilterCriteria({
  from, to, subject, query, negated_query, has_attachment, exclude_chats, size, size_comparison,
} = {}) {
  const criteria = {};
  if (from !== undefined) criteria.from = from;
  if (to !== undefined) criteria.to = to;
  if (subject !== undefined) criteria.subject = subject;
  if (query !== undefined) criteria.query = query;
  if (negated_query !== undefined) criteria.negatedQuery = negated_query;
  if (has_attachment !== undefined) criteria.hasAttachment = has_attachment;
  if (exclude_chats !== undefined) criteria.excludeChats = exclude_chats;
  if (size !== undefined) criteria.size = size;
  if (size_comparison !== undefined) criteria.sizeComparison = size_comparison;
  return criteria;
}

/**
 * Build the Gmail API's `action` object from the tool's snake_case inputs.
 * @param {{ add_label_ids?: string[], remove_label_ids?: string[], forward?: string }} params
 * @returns {object}
 */
export function buildFilterAction({ add_label_ids, remove_label_ids, forward } = {}) {
  const action = {};
  if (add_label_ids !== undefined) action.addLabelIds = add_label_ids;
  if (remove_label_ids !== undefined) action.removeLabelIds = remove_label_ids;
  if (forward !== undefined) action.forward = forward;
  return action;
}

/**
 * Shape a Gmail API `criteria` object back to the tool's snake_case output.
 * @param {object} criteria
 * @returns {object}
 */
export function shapeFilterCriteriaOut(criteria = {}) {
  const out = {};
  if (criteria.from !== undefined) out.from = criteria.from;
  if (criteria.to !== undefined) out.to = criteria.to;
  if (criteria.subject !== undefined) out.subject = criteria.subject;
  if (criteria.query !== undefined) out.query = criteria.query;
  if (criteria.negatedQuery !== undefined) out.negated_query = criteria.negatedQuery;
  if (criteria.hasAttachment !== undefined) out.has_attachment = criteria.hasAttachment;
  if (criteria.excludeChats !== undefined) out.exclude_chats = criteria.excludeChats;
  if (criteria.size !== undefined) out.size = criteria.size;
  if (criteria.sizeComparison !== undefined) out.size_comparison = criteria.sizeComparison;
  return out;
}

/**
 * Shape a Gmail API `action` object back to the tool's snake_case output.
 * @param {object} action
 * @returns {object}
 */
export function shapeFilterActionOut(action = {}) {
  const out = {};
  if (action.addLabelIds !== undefined) out.add_label_ids = action.addLabelIds;
  if (action.removeLabelIds !== undefined) out.remove_label_ids = action.removeLabelIds;
  if (action.forward !== undefined) out.forward = action.forward;
  return out;
}

/**
 * Shape a full Gmail API filter resource into the tool's documented output.
 * @param {{ id: string, criteria?: object, action?: object }} filter
 * @returns {{ id: string, criteria: object, action: object }}
 */
export function shapeFilter(filter) {
  return {
    id: filter.id,
    criteria: shapeFilterCriteriaOut(filter.criteria),
    action: shapeFilterActionOut(filter.action),
  };
}

// ── Pure Logic: batch label modification ────────────────────────────────────

/**
 * Split message IDs into chunks no larger than the Gmail API's per-call
 * limit for users.messages.batchModify (1000).
 * @param {string[]} ids
 * @param {number} [chunkSize]
 * @returns {string[][]}
 */
export function chunkMessageIds(ids = [], chunkSize = 1000) {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be a positive number');
  }
  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Summarize the result of one or more batchModify calls into the tool's
 * documented output shape.
 * @param {string[][]} chunks - the chunks that were actually sent
 * @param {string[]} add_label_ids
 * @param {string[]} remove_label_ids
 * @returns {{ modified_count: number, label_ids_added: string[], label_ids_removed: string[] }}
 */
export function summarizeBatchModify(chunks = [], add_label_ids = [], remove_label_ids = []) {
  const modified_count = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  return { modified_count, label_ids_added: add_label_ids, label_ids_removed: remove_label_ids };
}

// ── Pure Logic: sender aggregation ──────────────────────────────────────────

/**
 * Parse a `From` header value into a lowercased email address and its domain.
 * @param {string} fromValue - e.g. '"Some Sender" <someone@example.com>'
 * @returns {{ email: string, domain: string }}
 */
export function parseFromHeader(fromValue = '') {
  const match = fromValue.match(/<([^>]+)>/);
  const email = (match ? match[1] : fromValue).trim().toLowerCase();
  const domain = email.includes('@') ? email.split('@')[1] : '';
  return { email, domain };
}

/**
 * Group `{ from, subject }` pairs by sender, counting messages per sender
 * and keeping up to 5 distinct sample subjects so a sender spanning multiple
 * categories (e.g. an investment firm sending both tax slips and
 * promotions) is visible in one pass instead of hidden behind one example.
 * @param {{ from: string, subject?: string }[]} messages
 * @param {number} [maxSenders]
 * @returns {{ sender: string, domain: string, count: number, sample_subjects: string[] }[]}
 */
export function aggregateBySender(messages = [], maxSenders = 50) {
  const bySender = new Map();
  for (const { from, subject } of messages) {
    const { email, domain } = parseFromHeader(from);
    if (!email) continue;
    if (!bySender.has(email)) {
      bySender.set(email, { sender: email, domain, count: 0, sample_subjects: [] });
    }
    const entry = bySender.get(email);
    entry.count += 1;
    const subj = (subject || '').trim();
    if (subj && entry.sample_subjects.length < 5 && !entry.sample_subjects.includes(subj)) {
      entry.sample_subjects.push(subj);
    }
  }
  return [...bySender.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxSenders);
}

// ── Pure Logic: rate-limit backoff ──────────────────────────────────────────

/**
 * Compute an exponential backoff delay for a given retry attempt (0-based).
 * @param {number} attempt
 * @param {number} [baseMs]
 * @returns {number}
 */
export function computeBackoffDelayMs(attempt, baseMs = 500) {
  return baseMs * 2 ** attempt;
}

/**
 * Decide whether an error from the googleapis client represents a rate-limit
 * response (429, or 403 with a rate-limit reason) worth retrying.
 * @param {{ code?: number, response?: { status?: number } }} err
 * @returns {boolean}
 */
export function isRateLimitError(err) {
  const code = err?.code ?? err?.response?.status;
  return code === 429 || code === 403;
}

/**
 * Shape a full Gmail message resource into the tool's documented output.
 * @param {object} msg - Gmail API messages.get response (format=full)
 * @returns {object}
 */
export function shapeFullMessage(msg) {
  const headers = msg.payload?.headers || [];
  const { body_text, body_html, attachments } = extractBodyAndAttachments(msg.payload);
  return {
    id: msg.id,
    thread_id: msg.threadId,
    label_ids: msg.labelIds || [],
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    cc: getHeader(headers, 'Cc'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    snippet: msg.snippet || '',
    body_text,
    body_html,
    attachments,
  };
}

/**
 * Shape a message list-item into the tool's documented summary output.
 * @param {object} msg
 * @returns {{ id: string, thread_id: string, snippet: string }}
 */
export function shapeMessageSummary(msg) {
  return { id: msg.id, thread_id: msg.threadId, snippet: msg.snippet || '' };
}

/**
 * Shape a draft resource into the tool's documented output.
 * @param {object} draft - Gmail API drafts.get response
 * @returns {object}
 */
export function shapeFullDraft(draft) {
  const headers = draft.message?.payload?.headers || [];
  const { body_text } = extractBodyAndAttachments(draft.message?.payload);
  return {
    draft_id: draft.id,
    message_id: draft.message?.id,
    to: getHeader(headers, 'To'),
    cc: getHeader(headers, 'Cc'),
    subject: getHeader(headers, 'Subject'),
    body_text,
  };
}

// ── I/O Layer ────────────────────────────────────────────────────────────────

/**
 * Tool: gmail-list-messages
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ query?: string, label_ids?: string[], max_results?: number, page_token?: string }} params
 */
export async function listMessages(gmail, { query = '', label_ids, max_results = 25, page_token } = {}) {
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    labelIds: label_ids,
    maxResults: max_results,
    pageToken: page_token,
  });
  return {
    messages: (data.messages || []).map(shapeMessageSummary),
    next_page_token: data.nextPageToken || null,
  };
}

/**
 * Tool: gmail-get-message
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ message_id: string, format?: 'full'|'metadata' }} params
 */
export async function getMessage(gmail, { message_id, format = 'full' }) {
  const { data } = await gmail.users.messages.get({ userId: 'me', id: message_id, format });
  return shapeFullMessage(data);
}

/**
 * Tool: gmail-get-attachment
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ message_id: string, attachment_id: string }} params
 */
export async function getAttachment(gmail, { message_id, attachment_id }) {
  const [{ data: msg }, { data: attachment }] = await Promise.all([
    gmail.users.messages.get({ userId: 'me', id: message_id, format: 'full' }),
    gmail.users.messages.attachments.get({ userId: 'me', messageId: message_id, id: attachment_id }),
  ]);
  const { attachments } = extractBodyAndAttachments(msg.payload);
  const meta = attachments.find(a => a.attachment_id === attachment_id) || {};
  return {
    filename: meta.filename || '',
    mime_type: meta.mime_type || '',
    size: meta.size || attachment.size || 0,
    data_base64: base64UrlToBase64(attachment.data || ''),
  };
}

/**
 * Tool: gmail-list-labels
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 */
export async function listLabels(gmail) {
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  return {
    labels: (data.labels || []).map(l => ({ id: l.id, name: l.name, type: l.type })),
  };
}

/**
 * Tool: gmail-list-drafts
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ max_results?: number, page_token?: string }} params
 */
export async function listDrafts(gmail, { max_results = 25, page_token } = {}) {
  const { data } = await gmail.users.drafts.list({ userId: 'me', maxResults: max_results, pageToken: page_token });
  return {
    drafts: (data.drafts || []).map(d => ({
      draft_id: d.id,
      message_id: d.message?.id,
      snippet: d.message?.snippet || '',
    })),
    next_page_token: data.nextPageToken || null,
  };
}

/**
 * Tool: gmail-get-draft
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ draft_id: string }} params
 */
export async function getDraft(gmail, { draft_id }) {
  const { data } = await gmail.users.drafts.get({ userId: 'me', id: draft_id, format: 'full' });
  return shapeFullDraft(data);
}

/**
 * Tool: gmail-modify-labels (reversible)
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ message_id: string, add_label_ids?: string[], remove_label_ids?: string[] }} params
 */
export async function modifyLabels(gmail, { message_id, add_label_ids = [], remove_label_ids = [] }) {
  const { data } = await gmail.users.messages.modify({
    userId: 'me',
    id: message_id,
    requestBody: { addLabelIds: add_label_ids, removeLabelIds: remove_label_ids },
  });
  return { id: data.id, label_ids: data.labelIds || [] };
}

/**
 * Tool: gmail-trash-message (reversible — Trash, not permanent delete)
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ message_id: string }} params
 */
export async function trashMessage(gmail, { message_id }) {
  const { data } = await gmail.users.messages.trash({ userId: 'me', id: message_id });
  return { id: data.id, label_ids: data.labelIds || [] };
}

/**
 * Tool: gmail-create-draft (additive, not a send)
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ to: string[], subject: string, body: string, cc?: string[], bcc?: string[] }} params
 */
export async function createDraft(gmail, params) {
  const raw = buildRawMessage(params);
  const { data } = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
  return { draft_id: data.id, message_id: data.message?.id };
}

/**
 * Tool: gmail-create-label (additive, reversible via gated gmail-delete-label)
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ name: string }} params
 */
export async function createLabel(gmail, { name }) {
  const { data } = await gmail.users.labels.create({ userId: 'me', requestBody: { name } });
  return { id: data.id, name: data.name };
}

/**
 * Tool: gmail-send-message — IRREVERSIBLE. Callers (index.js) must not invoke
 * this without the human approval required by
 * steering/generic/gmail-irreversible-action-approval.md.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ to: string[], subject: string, body: string, cc?: string[], bcc?: string[] }} params
 */
export async function sendMessage(gmail, params) {
  const raw = buildRawMessage(params);
  const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  return { id: data.id, thread_id: data.threadId };
}

/**
 * Tool: gmail-send-draft — IRREVERSIBLE. Steering-gated, see sendMessage.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ draft_id: string }} params
 */
export async function sendDraft(gmail, { draft_id }) {
  const { data } = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draft_id } });
  return { id: data.id, thread_id: data.threadId };
}

/**
 * Tool: gmail-reply-message — IRREVERSIBLE. Steering-gated, see sendMessage.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ message_id: string, body: string, reply_all?: boolean }} params
 */
export async function replyMessage(gmail, { message_id, body, reply_all = false }) {
  const { data: original } = await gmail.users.messages.get({ userId: 'me', id: message_id, format: 'full' });
  const headers = original.payload?.headers || [];
  const fromHeader = getHeader(headers, 'From');
  const toHeader = getHeader(headers, 'To');
  const ccHeader = getHeader(headers, 'Cc');
  const messageIdHeader = getHeader(headers, 'Message-ID');
  const referencesHeader = getHeader(headers, 'References');
  const subject = buildReplySubject(getHeader(headers, 'Subject'));

  const to = [fromHeader].filter(Boolean);
  const cc = reply_all
    ? [toHeader, ccHeader].filter(Boolean).flatMap(v => v.split(',').map(s => s.trim())).filter(Boolean)
    : [];

  const raw = buildRawMessage({
    to,
    cc,
    subject,
    body,
    inReplyTo: messageIdHeader,
    references: [referencesHeader, messageIdHeader].filter(Boolean).join(' '),
  });

  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: original.threadId },
  });
  return { id: data.id, thread_id: data.threadId };
}

/**
 * Tool: gmail-delete-message — IRREVERSIBLE (permanent, bypasses Trash).
 * Steering-gated, see sendMessage.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ message_id: string }} params
 */
export async function deleteMessage(gmail, { message_id }) {
  await gmail.users.messages.delete({ userId: 'me', id: message_id });
  return { id: message_id, deleted: true };
}

/**
 * Tool: gmail-delete-draft — IRREVERSIBLE (permanent). Steering-gated, see sendMessage.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ draft_id: string }} params
 */
export async function deleteDraft(gmail, { draft_id }) {
  await gmail.users.drafts.delete({ userId: 'me', id: draft_id });
  return { draft_id, deleted: true };
}

/**
 * Tool: gmail-delete-label — IRREVERSIBLE (permanent, removes label from
 * every message it's applied to). Steering-gated, see sendMessage.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ label_id: string }} params
 */
export async function deleteLabel(gmail, { label_id }) {
  await gmail.users.labels.delete({ userId: 'me', id: label_id });
  return { id: label_id, deleted: true };
}

// ── I/O Layer: filters, batch labels, sender report ─────────────────────────
// Plan ID: docs/plans/gmail-filter-and-batch-tools-plan.md

/**
 * Tool: gmail-list-filters (read-only)
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 */
export async function listFilters(gmail) {
  const { data } = await gmail.users.settings.filters.list({ userId: 'me' });
  return { filters: (data.filter || []).map(shapeFilter) };
}

/**
 * Tool: gmail-create-filter (additive, reversible via gmail-delete-filter).
 * Only affects future mail — see gmail-batch-modify-labels for backfilling.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {Parameters<typeof buildFilterCriteria>[0] & Parameters<typeof buildFilterAction>[0]} params
 */
export async function createFilter(gmail, params = {}) {
  const requestBody = {
    criteria: buildFilterCriteria(params),
    action: buildFilterAction(params),
  };
  const { data } = await gmail.users.settings.filters.create({ userId: 'me', requestBody });
  return shapeFilter(data);
}

/**
 * Tool: gmail-delete-filter (removes the rule only; not gated — see
 * gmail.yaml description for rationale).
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ filter_id: string }} params
 */
export async function deleteFilter(gmail, { filter_id }) {
  await gmail.users.settings.filters.delete({ userId: 'me', id: filter_id });
  return { id: filter_id, deleted: true };
}

/**
 * Tool: gmail-batch-modify-labels (reversible — add/remove labels across
 * many messages). Chunks internally at the API's 1000-id-per-call limit.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ message_ids: string[], add_label_ids?: string[], remove_label_ids?: string[] }} params
 */
export async function batchModifyLabels(gmail, { message_ids = [], add_label_ids = [], remove_label_ids = [] }) {
  const chunks = chunkMessageIds(message_ids, 1000);
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: { ids: chunk, addLabelIds: add_label_ids, removeLabelIds: remove_label_ids },
    });
  }
  return summarizeBatchModify(chunks, add_label_ids, remove_label_ids);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SENDER_REPORT_CONCURRENCY = 25;
// A safety cap on how many messages a single gmail-sender-report call will
// scan, so an unbounded query (e.g. no date range) can't balloon into
// thousands of metadata fetches by accident. Callers should pass a bounded
// query (date range) per call; `truncated: true` in the output signals when
// this cap was hit and more messages exist beyond it.
const SENDER_REPORT_MAX_SCAN = 5000;

/**
 * Fetch From/Subject metadata for one message, retrying with exponential
 * backoff on rate-limit responses (429, or 403 rate-limit reasons).
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {string} messageId
 * @param {{ retries?: number, baseDelayMs?: number }} [opts]
 * @returns {Promise<{ from: string, subject: string }>}
 */
async function getMessageMetadataForReport(gmail, messageId, { retries = 3, baseDelayMs = 500 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      });
      const headers = data.payload?.headers || [];
      return { from: getHeader(headers, 'From'), subject: getHeader(headers, 'Subject') };
    } catch (err) {
      if (isRateLimitError(err) && attempt < retries) {
        await sleep(computeBackoffDelayMs(attempt, baseDelayMs));
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Tool: gmail-sender-report (read-only, convenience/discovery — not a
 * dependency of any other tool; see gmail.yaml description). Fetches
 * From/Subject metadata only — never message bodies — using
 * capped-concurrency requests rather than the Gmail API's raw HTTP batch
 * endpoint (see plan for rationale).
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 * @param {{ query?: string, max_senders?: number }} params
 */
export async function senderReport(gmail, { query = '', max_senders = 50 } = {}) {
  const ids = [];
  let pageToken;
  do {
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 500,
      pageToken,
    });
    for (const m of data.messages || []) ids.push(m.id);
    pageToken = data.nextPageToken || undefined;
  } while (pageToken && ids.length < SENDER_REPORT_MAX_SCAN);

  const truncated = Boolean(pageToken);
  const scanned = ids.slice(0, SENDER_REPORT_MAX_SCAN);

  const messages = [];
  for (let i = 0; i < scanned.length; i += SENDER_REPORT_CONCURRENCY) {
    const chunk = scanned.slice(i, i + SENDER_REPORT_CONCURRENCY);
    const results = await Promise.all(chunk.map((id) => getMessageMetadataForReport(gmail, id)));
    messages.push(...results);
  }

  return { senders: aggregateBySender(messages, max_senders), truncated };
}
