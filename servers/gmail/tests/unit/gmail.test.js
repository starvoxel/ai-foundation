/**
 * Unit tests for gmail server pure logic (logic.js) and pure auth decisions
 * (auth.js). No I/O, no protocol, no network.
 *
 * Plan ID: docs/plans/gmail-mcp-server-plan.md
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeBase64Url,
  base64UrlToBase64,
  base64UrlToUtf8,
  buildMimeMessage,
  buildRawMessage,
  buildReplySubject,
  getHeader,
  extractBodyAndAttachments,
  shapeFullMessage,
  shapeMessageSummary,
  shapeFullDraft,
} from '../../logic.js';

import {
  resolveTokenPath,
  validateTokenShape,
  isAccessTokenExpired,
  DEFAULT_TOKEN_PATH,
} from '../../auth.js';

// ── logic.js: encoding ──────────────────────────────────────────────────────

describe('unit: encodeBase64Url / base64UrlToBase64 / base64UrlToUtf8', () => {
  it('round-trips a UTF-8 string through base64url', () => {
    const original = 'Hello, world! 🎉';
    const encoded = encodeBase64Url(original);
    assert.ok(!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='));
    assert.equal(base64UrlToUtf8(encoded), original);
  });

  it('converts base64url to standard base64', () => {
    const encoded = encodeBase64Url('data??>>');
    const standard = base64UrlToBase64(encoded);
    assert.equal(Buffer.from(standard, 'base64').toString('utf-8'), 'data??>>');
  });
});

// ── logic.js: MIME building ─────────────────────────────────────────────────

describe('unit: buildMimeMessage / buildRawMessage', () => {
  it('builds headers in the expected order with To/Subject/body', () => {
    const mime = buildMimeMessage({ to: ['a@example.com'], subject: 'Hi', body: 'Body text' });
    assert.match(mime, /^To: a@example\.com\r\n/);
    assert.match(mime, /Subject: Hi\r\n/);
    assert.match(mime, /\r\n\r\nBody text$/);
  });

  it('includes Cc and Bcc only when provided', () => {
    const mime = buildMimeMessage({
      to: ['a@example.com'],
      cc: ['b@example.com'],
      bcc: ['c@example.com'],
      subject: 'Hi',
      body: 'x',
    });
    assert.match(mime, /Cc: b@example\.com/);
    assert.match(mime, /Bcc: c@example\.com/);
  });

  it('omits Cc/Bcc headers when not provided', () => {
    const mime = buildMimeMessage({ to: ['a@example.com'], subject: 'Hi', body: 'x' });
    assert.ok(!mime.includes('Cc:'));
    assert.ok(!mime.includes('Bcc:'));
  });

  it('includes In-Reply-To and References when provided', () => {
    const mime = buildMimeMessage({
      to: ['a@example.com'],
      subject: 'Re: Hi',
      body: 'x',
      inReplyTo: '<msg1@mail>',
      references: '<msg0@mail> <msg1@mail>',
    });
    assert.match(mime, /In-Reply-To: <msg1@mail>/);
    assert.match(mime, /References: <msg0@mail> <msg1@mail>/);
  });

  it('throws when "to" is missing or empty', () => {
    assert.throws(() => buildMimeMessage({ to: [], subject: 'Hi', body: 'x' }));
    assert.throws(() => buildMimeMessage({ subject: 'Hi', body: 'x' }));
  });

  it('buildRawMessage returns a base64url string decodable back to the MIME message', () => {
    const fields = { to: ['a@example.com'], subject: 'Hi', body: 'Body text' };
    const raw = buildRawMessage(fields);
    assert.equal(base64UrlToUtf8(raw), buildMimeMessage(fields));
  });
});

describe('unit: buildReplySubject', () => {
  it('prefixes "Re: " when not already present', () => {
    assert.equal(buildReplySubject('Meeting notes'), 'Re: Meeting notes');
  });

  it('does not double-prefix when already a reply subject', () => {
    assert.equal(buildReplySubject('Re: Meeting notes'), 'Re: Meeting notes');
    assert.equal(buildReplySubject('RE: Meeting notes'), 'RE: Meeting notes');
  });

  it('handles an empty original subject', () => {
    assert.equal(buildReplySubject(''), 'Re: ');
  });
});

// ── logic.js: response shaping ──────────────────────────────────────────────

describe('unit: getHeader', () => {
  const headers = [
    { name: 'From', value: 'sender@example.com' },
    { name: 'Subject', value: 'Hello' },
  ];

  it('finds a header case-insensitively', () => {
    assert.equal(getHeader(headers, 'from'), 'sender@example.com');
    assert.equal(getHeader(headers, 'SUBJECT'), 'Hello');
  });

  it('returns empty string when not found', () => {
    assert.equal(getHeader(headers, 'To'), '');
  });

  it('handles an empty/undefined headers array', () => {
    assert.equal(getHeader(undefined, 'From'), '');
    assert.equal(getHeader([], 'From'), '');
  });
});

describe('unit: extractBodyAndAttachments', () => {
  it('extracts a simple text/plain body with no parts', () => {
    const payload = {
      mimeType: 'text/plain',
      body: { data: encodeBase64Url('Plain body') },
    };
    const result = extractBodyAndAttachments(payload);
    assert.equal(result.body_text, 'Plain body');
    assert.equal(result.body_html, '');
    assert.deepEqual(result.attachments, []);
  });

  it('extracts text/plain and text/html from multipart/alternative', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: encodeBase64Url('plain') } },
        { mimeType: 'text/html', body: { data: encodeBase64Url('<p>html</p>') } },
      ],
    };
    const result = extractBodyAndAttachments(payload);
    assert.equal(result.body_text, 'plain');
    assert.equal(result.body_html, '<p>html</p>');
  });

  it('collects attachment metadata from nested parts', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: encodeBase64Url('body') } },
        {
          mimeType: 'multipart/mixed',
          parts: [
            {
              filename: 'report.pdf',
              mimeType: 'application/pdf',
              body: { attachmentId: 'att1', size: 1234 },
            },
          ],
        },
      ],
    };
    const result = extractBodyAndAttachments(payload);
    assert.equal(result.body_text, 'body');
    assert.deepEqual(result.attachments, [
      { attachment_id: 'att1', filename: 'report.pdf', mime_type: 'application/pdf', size: 1234 },
    ]);
  });

  it('handles a null/undefined payload without throwing', () => {
    const result = extractBodyAndAttachments(undefined);
    assert.deepEqual(result, { body_text: '', body_html: '', attachments: [] });
  });
});

describe('unit: shapeFullMessage / shapeMessageSummary / shapeFullDraft', () => {
  const rawMessage = {
    id: 'm1',
    threadId: 't1',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'Hi there...',
    payload: {
      headers: [
        { name: 'From', value: 'a@example.com' },
        { name: 'To', value: 'b@example.com' },
        { name: 'Subject', value: 'Hello' },
        { name: 'Date', value: 'Fri, 21 Aug 2026 00:00:00 +0000' },
      ],
      mimeType: 'text/plain',
      body: { data: encodeBase64Url('Body') },
    },
  };

  it('shapeFullMessage extracts headers, body, and label_ids', () => {
    const shaped = shapeFullMessage(rawMessage);
    assert.equal(shaped.id, 'm1');
    assert.equal(shaped.thread_id, 't1');
    assert.deepEqual(shaped.label_ids, ['INBOX', 'UNREAD']);
    assert.equal(shaped.from, 'a@example.com');
    assert.equal(shaped.subject, 'Hello');
    assert.equal(shaped.body_text, 'Body');
  });

  it('shapeMessageSummary extracts id/thread_id/snippet only', () => {
    assert.deepEqual(shapeMessageSummary(rawMessage), { id: 'm1', thread_id: 't1', snippet: 'Hi there...' });
  });

  it('shapeFullDraft extracts draft/message ids, headers, and body', () => {
    const rawDraft = { id: 'd1', message: rawMessage };
    const shaped = shapeFullDraft(rawDraft);
    assert.equal(shaped.draft_id, 'd1');
    assert.equal(shaped.message_id, 'm1');
    assert.equal(shaped.to, 'b@example.com');
    assert.equal(shaped.body_text, 'Body');
  });
});

// ── auth.js: pure decisions ─────────────────────────────────────────────────

describe('unit: resolveTokenPath', () => {
  it('uses the override when provided', () => {
    assert.equal(resolveTokenPath({}, '/custom/path.json'), '/custom/path.json');
  });

  it('falls back to GMAIL_TOKEN_PATH env var', () => {
    assert.equal(resolveTokenPath({ GMAIL_TOKEN_PATH: '/env/path.json' }), '/env/path.json');
  });

  it('falls back to the default path when nothing else is set', () => {
    assert.equal(resolveTokenPath({}), DEFAULT_TOKEN_PATH);
  });
});

describe('unit: validateTokenShape', () => {
  it('accepts a token object with all required fields', () => {
    const result = validateTokenShape({ client_id: 'a', client_secret: 'b', refresh_token: 'c' });
    assert.deepEqual(result, { valid: true, errors: [] });
  });

  it('rejects non-object input', () => {
    assert.equal(validateTokenShape(null).valid, false);
    assert.equal(validateTokenShape('nope').valid, false);
  });

  it('reports each missing required field', () => {
    const result = validateTokenShape({ client_id: 'a' });
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 2);
  });
});

describe('unit: isAccessTokenExpired', () => {
  const now = 1_000_000_000;

  it('treats a missing expiry as expired', () => {
    assert.equal(isAccessTokenExpired(undefined, now), true);
    assert.equal(isAccessTokenExpired(null, now), true);
  });

  it('treats a future expiry beyond the skew margin as not expired', () => {
    assert.equal(isAccessTokenExpired(now + 120_000, now), false);
  });

  it('treats an expiry within the skew margin as expired', () => {
    assert.equal(isAccessTokenExpired(now + 30_000, now), true);
  });

  it('treats a past expiry as expired', () => {
    assert.equal(isAccessTokenExpired(now - 1000, now), true);
  });
});
