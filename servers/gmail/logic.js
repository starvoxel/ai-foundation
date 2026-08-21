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
