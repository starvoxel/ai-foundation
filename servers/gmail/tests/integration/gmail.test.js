/**
 * Integration tests for gmail server I/O layer.
 *
 * - logic.js functions are tested against a fake Gmail API client (no real
 *   network calls, no real mailbox) — verifies parameter passing and
 *   response shaping end-to-end for each tool.
 * - auth.js token-store functions are tested against the real filesystem
 *   using temp files.
 *
 * Plan ID: docs/plans/gmail-mcp-server-plan.md
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  encodeBase64Url,
  listMessages,
  getMessage,
  getAttachment,
  listLabels,
  listDrafts,
  getDraft,
  modifyLabels,
  trashMessage,
  createDraft,
  createLabel,
  sendMessage,
  sendDraft,
  replyMessage,
  deleteMessage,
  deleteDraft,
  deleteLabel,
} from '../../logic.js';

import {
  loadTokenFile,
  saveTokenFile,
  buildOAuth2Client,
  validateTokenShape,
} from '../../auth.js';

// ── Fake Gmail API client ───────────────────────────────────────────────────

function fakeGmailClient() {
  return {
    users: {
      messages: {
        list: mock.fn(async () => ({ data: { messages: [{ id: 'm1', threadId: 't1', snippet: 'hi' }], nextPageToken: 'np1' } })),
        get: mock.fn(async () => ({
          data: {
            id: 'm1',
            threadId: 't1',
            labelIds: ['INBOX'],
            snippet: 'hi',
            payload: {
              headers: [
                { name: 'From', value: 'sender@example.com' },
                { name: 'Subject', value: 'Hello' },
              ],
              mimeType: 'text/plain',
              body: { data: encodeBase64Url('Body') },
            },
          },
        })),
        modify: mock.fn(async () => ({ data: { id: 'm1', labelIds: ['INBOX', 'STARRED'] } })),
        trash: mock.fn(async () => ({ data: { id: 'm1', labelIds: ['TRASH'] } })),
        send: mock.fn(async () => ({ data: { id: 'sent1', threadId: 't1' } })),
        delete: mock.fn(async () => ({ data: {} })),
        attachments: {
          get: mock.fn(async () => ({ data: { data: encodeBase64Url('filedata'), size: 8 } })),
        },
      },
      labels: {
        list: mock.fn(async () => ({ data: { labels: [{ id: 'L1', name: 'Work', type: 'user' }] } })),
        create: mock.fn(async () => ({ data: { id: 'L2', name: 'New Label' } })),
        delete: mock.fn(async () => ({ data: {} })),
      },
      drafts: {
        list: mock.fn(async () => ({ data: { drafts: [{ id: 'd1', message: { id: 'm2', snippet: 'draft snip' } }], nextPageToken: null } })),
        get: mock.fn(async () => ({
          data: {
            id: 'd1',
            message: {
              id: 'm2',
              payload: {
                headers: [{ name: 'To', value: 'x@example.com' }, { name: 'Subject', value: 'Draft subj' }],
                mimeType: 'text/plain',
                body: { data: encodeBase64Url('draft body') },
              },
            },
          },
        })),
        create: mock.fn(async () => ({ data: { id: 'd2', message: { id: 'm3' } } })),
        send: mock.fn(async () => ({ data: { id: 'sent2', threadId: 't2' } })),
        delete: mock.fn(async () => ({ data: {} })),
      },
    },
  };
}

// ── logic.js I/O layer ──────────────────────────────────────────────────────

describe('integration: gmail logic I/O layer (fake client)', () => {
  let gmail;

  beforeEach(() => {
    gmail = fakeGmailClient();
  });

  it('listMessages passes query/labels/pagination and shapes results', async () => {
    const result = await listMessages(gmail, { query: 'is:unread', label_ids: ['INBOX'], max_results: 10, page_token: 'pt' });
    assert.equal(gmail.users.messages.list.mock.calls.length, 1);
    const callArgs = gmail.users.messages.list.mock.calls[0].arguments[0];
    assert.equal(callArgs.q, 'is:unread');
    assert.deepEqual(callArgs.labelIds, ['INBOX']);
    assert.equal(callArgs.maxResults, 10);
    assert.equal(callArgs.pageToken, 'pt');
    assert.deepEqual(result, { messages: [{ id: 'm1', thread_id: 't1', snippet: 'hi' }], next_page_token: 'np1' });
  });

  it('getMessage fetches and shapes a full message', async () => {
    const result = await getMessage(gmail, { message_id: 'm1' });
    assert.equal(result.id, 'm1');
    assert.equal(result.from, 'sender@example.com');
    assert.equal(result.body_text, 'Body');
  });

  it('getAttachment fetches and decodes attachment data', async () => {
    const result = await getAttachment(gmail, { message_id: 'm1', attachment_id: 'att1' });
    assert.equal(Buffer.from(result.data_base64, 'base64').toString('utf-8'), 'filedata');
  });

  it('listLabels shapes label list', async () => {
    const result = await listLabels(gmail);
    assert.deepEqual(result, { labels: [{ id: 'L1', name: 'Work', type: 'user' }] });
  });

  it('listDrafts shapes draft list', async () => {
    const result = await listDrafts(gmail);
    assert.deepEqual(result, { drafts: [{ draft_id: 'd1', message_id: 'm2', snippet: 'draft snip' }], next_page_token: null });
  });

  it('getDraft shapes a full draft', async () => {
    const result = await getDraft(gmail, { draft_id: 'd1' });
    assert.equal(result.draft_id, 'd1');
    assert.equal(result.to, 'x@example.com');
    assert.equal(result.body_text, 'draft body');
  });

  it('modifyLabels passes add/remove label ids', async () => {
    const result = await modifyLabels(gmail, { message_id: 'm1', add_label_ids: ['STARRED'], remove_label_ids: ['UNREAD'] });
    const callArgs = gmail.users.messages.modify.mock.calls[0].arguments[0];
    assert.deepEqual(callArgs.requestBody, { addLabelIds: ['STARRED'], removeLabelIds: ['UNREAD'] });
    assert.deepEqual(result, { id: 'm1', label_ids: ['INBOX', 'STARRED'] });
  });

  it('trashMessage moves a message to trash (not permanent)', async () => {
    const result = await trashMessage(gmail, { message_id: 'm1' });
    assert.equal(gmail.users.messages.trash.mock.calls.length, 1);
    assert.deepEqual(result, { id: 'm1', label_ids: ['TRASH'] });
  });

  it('createDraft builds a raw MIME message and returns ids', async () => {
    const result = await createDraft(gmail, { to: ['a@example.com'], subject: 'Hi', body: 'text' });
    const callArgs = gmail.users.drafts.create.mock.calls[0].arguments[0];
    assert.ok(callArgs.requestBody.message.raw);
    assert.deepEqual(result, { draft_id: 'd2', message_id: 'm3' });
  });

  it('createLabel passes the label name', async () => {
    const result = await createLabel(gmail, { name: 'New Label' });
    assert.equal(gmail.users.labels.create.mock.calls[0].arguments[0].requestBody.name, 'New Label');
    assert.deepEqual(result, { id: 'L2', name: 'New Label' });
  });

  it('sendMessage builds a raw message and sends it', async () => {
    const result = await sendMessage(gmail, { to: ['a@example.com'], subject: 'Hi', body: 'text' });
    assert.equal(gmail.users.messages.send.mock.calls.length, 1);
    assert.deepEqual(result, { id: 'sent1', thread_id: 't1' });
  });

  it('sendDraft sends an existing draft by id', async () => {
    const result = await sendDraft(gmail, { draft_id: 'd1' });
    assert.equal(gmail.users.drafts.send.mock.calls[0].arguments[0].requestBody.id, 'd1');
    assert.deepEqual(result, { id: 'sent2', thread_id: 't2' });
  });

  it('replyMessage fetches the original, builds a threaded reply, and sends it', async () => {
    const result = await replyMessage(gmail, { message_id: 'm1', body: 'reply text' });
    assert.equal(gmail.users.messages.get.mock.calls.length, 1);
    const sendArgs = gmail.users.messages.send.mock.calls[0].arguments[0];
    assert.equal(sendArgs.requestBody.threadId, 't1');
    assert.deepEqual(result, { id: 'sent1', thread_id: 't1' });
  });

  it('deleteMessage calls the permanent-delete API and returns confirmation', async () => {
    const result = await deleteMessage(gmail, { message_id: 'm1' });
    assert.equal(gmail.users.messages.delete.mock.calls.length, 1);
    assert.deepEqual(result, { id: 'm1', deleted: true });
  });

  it('deleteDraft calls the permanent-delete API and returns confirmation', async () => {
    const result = await deleteDraft(gmail, { draft_id: 'd1' });
    assert.equal(gmail.users.drafts.delete.mock.calls.length, 1);
    assert.deepEqual(result, { draft_id: 'd1', deleted: true });
  });

  it('deleteLabel calls the permanent-delete API and returns confirmation', async () => {
    const result = await deleteLabel(gmail, { label_id: 'L1' });
    assert.equal(gmail.users.labels.delete.mock.calls.length, 1);
    assert.deepEqual(result, { id: 'L1', deleted: true });
  });
});

// ── auth.js I/O layer (real filesystem, temp files) ─────────────────────────

describe('integration: gmail auth token store (real filesystem)', () => {
  let tempDir;
  let tokenPath;

  beforeEach(() => {
    tempDir = join(tmpdir(), 'gmail-auth-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    tokenPath = join(tempDir, 'nested', 'gmail-token.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('saveTokenFile creates parent directories and writes JSON', () => {
    saveTokenFile(tokenPath, { client_id: 'a', client_secret: 'b', refresh_token: 'c' });
    assert.ok(existsSync(tokenPath));
    const parsed = JSON.parse(readFileSync(tokenPath, 'utf-8'));
    assert.equal(parsed.client_id, 'a');
  });

  it('loadTokenFile round-trips data written by saveTokenFile', () => {
    saveTokenFile(tokenPath, { client_id: 'a', client_secret: 'b', refresh_token: 'c' });
    const loaded = loadTokenFile(tokenPath);
    assert.equal(loaded.refresh_token, 'c');
  });

  it('loadTokenFile throws a helpful error when the file does not exist', () => {
    assert.throws(() => loadTokenFile(tokenPath), /authorize\.js/);
  });

  it('loadTokenFile throws when the file contains invalid JSON', () => {
    mkdirSync(join(tempDir, 'nested'), { recursive: true });
    writeFileSync(tokenPath, '{ not valid json', 'utf-8');
    assert.throws(() => loadTokenFile(tokenPath), /not valid JSON/);
  });

  it('loadTokenFile throws when required fields are missing', () => {
    mkdirSync(join(tempDir, 'nested'), { recursive: true });
    writeFileSync(tokenPath, JSON.stringify({ client_id: 'a' }), 'utf-8');
    assert.throws(() => loadTokenFile(tokenPath), /invalid/);
  });

  it('buildOAuth2Client builds a client with the stored credentials', () => {
    saveTokenFile(tokenPath, { client_id: 'cid', client_secret: 'csecret', refresh_token: 'rtok', access_token: 'atok', expiry_date: 123 });
    const client = buildOAuth2Client(tokenPath);
    assert.equal(client._clientId, 'cid');
    assert.equal(client.credentials.refresh_token, 'rtok');
    assert.equal(client.credentials.access_token, 'atok');
  });

  it('buildOAuth2Client persists rotated tokens back to the file via the "tokens" event', () => {
    saveTokenFile(tokenPath, { client_id: 'cid', client_secret: 'csecret', refresh_token: 'rtok' });
    const client = buildOAuth2Client(tokenPath);
    client.emit('tokens', { access_token: 'new-access', expiry_date: 999 });
    const reloaded = loadTokenFile(tokenPath);
    assert.equal(reloaded.access_token, 'new-access');
    assert.equal(reloaded.refresh_token, 'rtok'); // unchanged, since rotation didn't include a new one
  });

  it('validateTokenShape is consistent with loadTokenFile\'s acceptance criteria', () => {
    saveTokenFile(tokenPath, { client_id: 'a', client_secret: 'b', refresh_token: 'c' });
    const data = JSON.parse(readFileSync(tokenPath, 'utf-8'));
    assert.equal(validateTokenShape(data).valid, true);
  });
});
