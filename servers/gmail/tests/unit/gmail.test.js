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
  buildFilterCriteria,
  buildFilterAction,
  shapeFilterCriteriaOut,
  shapeFilterActionOut,
  shapeFilter,
  chunkMessageIds,
  summarizeBatchModify,
  parseFromHeader,
  aggregateBySender,
  computeBackoffDelayMs,
  isRateLimitError,
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
    assert.deepEqual(shapeMessageSummary(rawMessage), {
      id: 'm1',
      thread_id: 't1',
      snippet: 'Hi there...',
    });
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

// ── logic.js: filter criteria/action shaping ────────────────────────────────

describe('unit: buildFilterCriteria / buildFilterAction', () => {
  it('maps all snake_case criteria fields to the API camelCase shape', () => {
    const criteria = buildFilterCriteria({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Invoice',
      query: 'has:attachment',
      negated_query: 'promo',
      has_attachment: true,
      exclude_chats: true,
      size: 1000,
      size_comparison: 'larger',
    });
    assert.deepEqual(criteria, {
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Invoice',
      query: 'has:attachment',
      negatedQuery: 'promo',
      hasAttachment: true,
      excludeChats: true,
      size: 1000,
      sizeComparison: 'larger',
    });
  });

  it('omits undefined criteria fields rather than sending null/false', () => {
    assert.deepEqual(buildFilterCriteria({ from: 'a@b.com' }), { from: 'a@b.com' });
    assert.deepEqual(buildFilterCriteria(), {});
  });

  it('maps action fields to the API camelCase shape', () => {
    const action = buildFilterAction({
      add_label_ids: ['L1'],
      remove_label_ids: ['L2'],
      forward: 'x@y.com',
    });
    assert.deepEqual(action, { addLabelIds: ['L1'], removeLabelIds: ['L2'], forward: 'x@y.com' });
  });

  it('omits undefined action fields', () => {
    assert.deepEqual(buildFilterAction({ add_label_ids: ['L1'] }), { addLabelIds: ['L1'] });
    assert.deepEqual(buildFilterAction(), {});
  });
});

describe('unit: shapeFilterCriteriaOut / shapeFilterActionOut / shapeFilter', () => {
  it('shapes API criteria back to snake_case', () => {
    const out = shapeFilterCriteriaOut({
      from: 'a@b.com',
      hasAttachment: true,
      sizeComparison: 'larger',
    });
    assert.deepEqual(out, { from: 'a@b.com', has_attachment: true, size_comparison: 'larger' });
  });

  it('shapes API action back to snake_case', () => {
    const out = shapeFilterActionOut({ addLabelIds: ['L1'], forward: 'x@y.com' });
    assert.deepEqual(out, { add_label_ids: ['L1'], forward: 'x@y.com' });
  });

  it('handles missing criteria/action gracefully', () => {
    assert.deepEqual(shapeFilterCriteriaOut(), {});
    assert.deepEqual(shapeFilterActionOut(), {});
  });

  it('shapeFilter composes id + shaped criteria + shaped action', () => {
    const filter = shapeFilter({
      id: 'f1',
      criteria: { from: 'a@b.com' },
      action: { addLabelIds: ['L1'] },
    });
    assert.deepEqual(filter, {
      id: 'f1',
      criteria: { from: 'a@b.com' },
      action: { add_label_ids: ['L1'] },
    });
  });
});

// ── logic.js: batch label modification ──────────────────────────────────────

describe('unit: chunkMessageIds', () => {
  it('splits into exact-multiple chunks', () => {
    assert.deepEqual(chunkMessageIds(['a', 'b', 'c', 'd'], 2), [
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles a remainder in the last chunk', () => {
    assert.deepEqual(chunkMessageIds(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
  });

  it('returns a single chunk when under the chunk size', () => {
    assert.deepEqual(chunkMessageIds(['a'], 1000), [['a']]);
  });

  it('returns no chunks for an empty array', () => {
    assert.deepEqual(chunkMessageIds([], 1000), []);
  });

  it('throws for a non-positive chunk size', () => {
    assert.throws(() => chunkMessageIds(['a'], 0));
  });
});

describe('unit: summarizeBatchModify', () => {
  it('sums modified_count across chunks and echoes the label id arrays', () => {
    const summary = summarizeBatchModify([['a', 'b'], ['c']], ['L1'], ['L2']);
    assert.deepEqual(summary, {
      modified_count: 3,
      label_ids_added: ['L1'],
      label_ids_removed: ['L2'],
    });
  });

  it('handles no chunks', () => {
    assert.deepEqual(summarizeBatchModify([]), {
      modified_count: 0,
      label_ids_added: [],
      label_ids_removed: [],
    });
  });
});

// ── logic.js: sender aggregation ────────────────────────────────────────────

describe('unit: parseFromHeader', () => {
  it('extracts email and domain from a display-name form', () => {
    assert.deepEqual(parseFromHeader('"Some Sender" <someone@example.com>'), {
      email: 'someone@example.com',
      domain: 'example.com',
    });
  });

  it('handles a bare email address with no display name', () => {
    assert.deepEqual(parseFromHeader('someone@example.com'), {
      email: 'someone@example.com',
      domain: 'example.com',
    });
  });

  it('lowercases the email address', () => {
    assert.equal(parseFromHeader('Someone@Example.COM').email, 'someone@example.com');
  });

  it('handles an empty/missing value', () => {
    assert.deepEqual(parseFromHeader(''), { email: '', domain: '' });
    assert.deepEqual(parseFromHeader(undefined), { email: '', domain: '' });
  });
});

describe('unit: aggregateBySender', () => {
  it('groups by sender, counts messages, and sorts by count descending', () => {
    const result = aggregateBySender(
      [
        { from: 'a@b.com', subject: 's1' },
        { from: 'c@d.com', subject: 's2' },
        { from: 'a@b.com', subject: 's3' },
        { from: 'a@b.com', subject: 's4' },
      ],
      50,
    );
    assert.equal(result[0].sender, 'a@b.com');
    assert.equal(result[0].count, 3);
    assert.equal(result[1].sender, 'c@d.com');
    assert.equal(result[1].count, 1);
  });

  it('caps sample_subjects at 5 distinct subjects per sender', () => {
    const messages = Array.from({ length: 8 }, (_, i) => ({ from: 'a@b.com', subject: `s${i}` }));
    const result = aggregateBySender(messages, 50);
    assert.equal(result[0].sample_subjects.length, 5);
  });

  it('shows multiple distinct subjects for a sender spanning categories', () => {
    const result = aggregateBySender(
      [
        { from: 'invest@firm.com', subject: 'Your 2025 tax slip' },
        { from: 'invest@firm.com', subject: 'Quarterly account report' },
        { from: 'invest@firm.com', subject: 'New promotion for you' },
      ],
      50,
    );
    assert.deepEqual(result[0].sample_subjects, [
      'Your 2025 tax slip',
      'Quarterly account report',
      'New promotion for you',
    ]);
  });

  it('respects the maxSenders cap', () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({ from: `s${i}@b.com`, subject: 'x' }));
    const result = aggregateBySender(messages, 2);
    assert.equal(result.length, 2);
  });

  it('skips messages with no parseable sender', () => {
    const result = aggregateBySender([{ from: '', subject: 'x' }], 50);
    assert.deepEqual(result, []);
  });
});

// ── logic.js: rate-limit backoff ────────────────────────────────────────────

describe('unit: computeBackoffDelayMs', () => {
  it('doubles the delay for each successive attempt', () => {
    assert.equal(computeBackoffDelayMs(0, 500), 500);
    assert.equal(computeBackoffDelayMs(1, 500), 1000);
    assert.equal(computeBackoffDelayMs(2, 500), 2000);
  });
});

describe('unit: isRateLimitError', () => {
  it('treats a 429 code as a rate-limit error', () => {
    assert.equal(isRateLimitError({ code: 429 }), true);
  });

  it('treats a 403 code as a rate-limit error', () => {
    assert.equal(isRateLimitError({ code: 403 }), true);
  });

  it('reads the code from response.status when top-level code is absent', () => {
    assert.equal(isRateLimitError({ response: { status: 429 } }), true);
  });

  it('does not treat other errors as rate-limit errors', () => {
    assert.equal(isRateLimitError({ code: 500 }), false);
    assert.equal(isRateLimitError(new Error('boom')), false);
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
