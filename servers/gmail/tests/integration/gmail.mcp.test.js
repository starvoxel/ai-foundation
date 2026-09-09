/**
 * MCP protocol layer integration tests for the gmail server.
 * Tests tool listing and invocation via the MCP protocol using in-memory
 * transport, with a fake Gmail API client injected into createGmailServer
 * so no real network calls are made.
 *
 * Plan ID: docs/plans/gmail-mcp-server-plan.md
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createGmailServer } from '../../index.js';
import { encodeBase64Url } from '../../logic.js';

const ALL_TOOL_NAMES = [
  'gmail-list-messages',
  'gmail-get-message',
  'gmail-get-attachment',
  'gmail-list-labels',
  'gmail-list-drafts',
  'gmail-get-draft',
  'gmail-list-filters',
  'gmail-sender-report',
  'gmail-modify-labels',
  'gmail-trash-message',
  'gmail-create-draft',
  'gmail-create-label',
  'gmail-create-filter',
  'gmail-delete-filter',
  'gmail-batch-modify-labels',
  'gmail-send-message',
  'gmail-send-draft',
  'gmail-reply-message',
  'gmail-delete-message',
  'gmail-delete-draft',
  'gmail-delete-label',
].sort();

const GATED_TOOL_NAMES = [
  'gmail-send-message',
  'gmail-send-draft',
  'gmail-reply-message',
  'gmail-delete-message',
  'gmail-delete-draft',
  'gmail-delete-label',
];

function fakeGmailClient() {
  return {
    users: {
      messages: {
        list: mock.fn(async () => ({
          data: { messages: [{ id: 'm1', threadId: 't1', snippet: 'hi' }] },
        })),
        get: mock.fn(async () => ({
          data: {
            id: 'm1',
            threadId: 't1',
            labelIds: ['INBOX'],
            snippet: 'hi',
            payload: {
              headers: [{ name: 'Subject', value: 'Hello' }],
              mimeType: 'text/plain',
              body: { data: encodeBase64Url('Body') },
            },
          },
        })),
        send: mock.fn(async () => ({ data: { id: 'sent1', threadId: 't1' } })),
        delete: mock.fn(async () => ({ data: {} })),
        modify: mock.fn(async () => ({ data: { id: 'm1', labelIds: [] } })),
        trash: mock.fn(async () => ({ data: { id: 'm1', labelIds: ['TRASH'] } })),
        attachments: {
          get: mock.fn(async () => ({ data: { data: encodeBase64Url('x'), size: 1 } })),
        },
        batchModify: mock.fn(async () => ({ data: {} })),
      },
      labels: {
        list: mock.fn(async () => ({ data: { labels: [] } })),
        create: mock.fn(async () => ({ data: { id: 'L1', name: 'New' } })),
        delete: mock.fn(async () => ({ data: {} })),
      },
      drafts: {
        list: mock.fn(async () => ({ data: { drafts: [] } })),
        get: mock.fn(async () => ({
          data: { id: 'd1', message: { id: 'm2', payload: { headers: [] } } },
        })),
        create: mock.fn(async () => ({ data: { id: 'd1', message: { id: 'm2' } } })),
        send: mock.fn(async () => ({ data: { id: 'sent2', threadId: 't2' } })),
        delete: mock.fn(async () => ({ data: {} })),
      },
      settings: {
        filters: {
          list: mock.fn(async () => ({
            data: {
              filter: [
                { id: 'f1', criteria: { from: 'a@b.com' }, action: { addLabelIds: ['L1'] } },
              ],
            },
          })),
          create: mock.fn(async () => ({
            data: { id: 'f2', criteria: { from: 'c@d.com' }, action: { addLabelIds: ['L2'] } },
          })),
          delete: mock.fn(async () => ({ data: {} })),
        },
      },
    },
  };
}

describe('mcp: gmail server protocol layer', () => {
  let client;
  let server;
  let gmail;

  beforeEach(async () => {
    gmail = fakeGmailClient();
    server = createGmailServer(gmail);
    client = new Client({ name: 'test-client', version: '1.0.0' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('lists all 21 declared tools', async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ALL_TOOL_NAMES);
  });

  it('every tool has a non-trivial description', async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      assert.ok(
        tool.description && tool.description.length > 10,
        `Tool ${tool.name} should have a description`,
      );
    }
  });

  it('every gated (irreversible) tool description flags the approval requirement', async () => {
    const result = await client.listTools();
    for (const name of GATED_TOOL_NAMES) {
      const tool = result.tools.find((t) => t.name === name);
      assert.ok(tool, `Expected gated tool ${name} to be registered`);
      assert.match(tool.description, /Irreversible action.*explicit human approval/i);
    }
  });

  it('non-gated tools do not carry the irreversible-action notice', async () => {
    const result = await client.listTools();
    for (const tool of result.tools) {
      if (!GATED_TOOL_NAMES.includes(tool.name)) {
        assert.ok(
          !/Irreversible action/i.test(tool.description),
          `Tool ${tool.name} should not be marked irreversible`,
        );
      }
    }
  });

  it('invokes gmail-list-messages and returns shaped JSON', async () => {
    const result = await client.callTool({
      name: 'gmail-list-messages',
      arguments: { query: 'is:unread' },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed.messages, [{ id: 'm1', thread_id: 't1', snippet: 'hi' }]);
  });

  it('invokes gmail-get-message and returns shaped JSON', async () => {
    const result = await client.callTool({
      name: 'gmail-get-message',
      arguments: { message_id: 'm1' },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.id, 'm1');
    assert.equal(parsed.body_text, 'Body');
  });

  it('invokes gmail-send-message (gated tool, invocation itself is unconditional at the protocol layer)', async () => {
    const result = await client.callTool({
      name: 'gmail-send-message',
      arguments: { to: ['a@example.com'], subject: 'Hi', body: 'text' },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed, { id: 'sent1', thread_id: 't1' });
    assert.equal(gmail.users.messages.send.mock.calls.length, 1);
  });

  it('invokes gmail-delete-label and returns confirmation', async () => {
    const result = await client.callTool({
      name: 'gmail-delete-label',
      arguments: { label_id: 'L1' },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed, { id: 'L1', deleted: true });
  });

  it('invokes gmail-list-filters and returns shaped JSON', async () => {
    const result = await client.callTool({ name: 'gmail-list-filters', arguments: {} });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed.filters, [
      { id: 'f1', criteria: { from: 'a@b.com' }, action: { add_label_ids: ['L1'] } },
    ]);
  });

  it('invokes gmail-create-filter and returns the created filter', async () => {
    const result = await client.callTool({
      name: 'gmail-create-filter',
      arguments: { from: 'c@d.com', add_label_ids: ['L2'] },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed, {
      id: 'f2',
      criteria: { from: 'c@d.com' },
      action: { add_label_ids: ['L2'] },
    });
    assert.equal(gmail.users.settings.filters.create.mock.calls.length, 1);
  });

  it('invokes gmail-delete-filter and returns confirmation', async () => {
    const result = await client.callTool({
      name: 'gmail-delete-filter',
      arguments: { filter_id: 'f1' },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed, { id: 'f1', deleted: true });
  });

  it('invokes gmail-batch-modify-labels and returns a summary', async () => {
    const result = await client.callTool({
      name: 'gmail-batch-modify-labels',
      arguments: { message_ids: ['m1', 'm2'], add_label_ids: ['L1'] },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed, { modified_count: 2, label_ids_added: ['L1'], label_ids_removed: [] });
    assert.equal(gmail.users.messages.batchModify.mock.calls.length, 1);
  });

  it('invokes gmail-sender-report and returns aggregated senders', async () => {
    gmail.users.messages.list.mock.mockImplementationOnce(async () => ({
      data: { messages: [{ id: 'm1' }] },
    }));
    gmail.users.messages.get.mock.mockImplementationOnce(async () => ({
      data: {
        payload: {
          headers: [
            { name: 'From', value: 'a@b.com' },
            { name: 'Subject', value: 'Hi' },
          ],
        },
      },
    }));
    const result = await client.callTool({
      name: 'gmail-sender-report',
      arguments: { query: 'in:inbox' },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed, {
      senders: [{ sender: 'a@b.com', domain: 'b.com', count: 1, sample_subjects: ['Hi'] }],
      truncated: false,
    });
  });

  it('handles a tool error gracefully without throwing', async () => {
    gmail.users.messages.get.mock.mockImplementationOnce(async () => {
      throw new Error('simulated API failure');
    });
    const result = await client.callTool({
      name: 'gmail-get-message',
      arguments: { message_id: 'missing' },
    });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.match(parsed.error, /simulated API failure/);
  });
});
