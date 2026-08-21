#!/usr/bin/env node
/**
 * Gmail MCP server — stdio entry point.
 *
 * Thin protocol wrapper: builds an authorized Gmail API client once at
 * startup, then registers each tool from gmail.yaml, delegating to the pure
 * + I/O functions in logic.js. This is the file that gets spawned by the
 * MCP host via stdio transport.
 *
 * Plan ID: docs/plans/gmail-mcp-server-plan.md
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { google } from 'googleapis';

import { getAuthorizedClient } from './auth.js';
import {
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
} from './logic.js';

const SERVER_VERSION = '0.1.0';

const IRREVERSIBLE_NOTICE =
  'Irreversible action — requires prior explicit human approval per steering; never call without it. ';

/**
 * Build the MCP server with all tools registered. Accepts the Gmail API
 * client as a parameter so tests can register against a fake client.
 * @param {import('googleapis').gmail_v1.Gmail} gmail
 */
export function createGmailServer(gmail) {
  const server = new McpServer({ name: 'gmail', version: SERVER_VERSION });

  const asText = (result) => ({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
  const asError = (err) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
    isError: true,
  });
  const wrap = (fn) => async (args) => {
    try {
      return asText(await fn(gmail, args));
    } catch (err) {
      return asError(err);
    }
  };

  // ── Read-only ──────────────────────────────────────────────────────────
  server.registerTool('gmail_list_messages', {
    description: 'Lists/searches messages matching a Gmail search query, with optional label filter and pagination.',
    inputSchema: {
      query: z.string().optional().describe('Gmail search query'),
      label_ids: z.array(z.string()).optional().describe('Restrict to messages having all of these label IDs'),
      max_results: z.number().optional().describe('Maximum messages to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
  }, wrap(listMessages));

  server.registerTool('gmail_get_message', {
    description: 'Fetches full content and headers of a single message by ID.',
    inputSchema: {
      message_id: z.string().describe('Gmail message ID'),
      format: z.enum(['full', 'metadata']).optional().describe("'full' or 'metadata'"),
    },
  }, wrap(getMessage));

  server.registerTool('gmail_get_attachment', {
    description: "Downloads a single attachment's content from a message.",
    inputSchema: {
      message_id: z.string().describe('Gmail message ID'),
      attachment_id: z.string().describe('Attachment ID from gmail_get_message output'),
    },
  }, wrap(getAttachment));

  server.registerTool('gmail_list_labels', {
    description: 'Lists all labels (system and user-created) in the mailbox.',
    inputSchema: {},
  }, wrap(listLabels));

  server.registerTool('gmail_list_drafts', {
    description: 'Lists existing drafts.',
    inputSchema: {
      max_results: z.number().optional().describe('Maximum drafts to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
  }, wrap(listDrafts));

  server.registerTool('gmail_get_draft', {
    description: 'Fetches full content of a single draft by ID.',
    inputSchema: { draft_id: z.string().describe('Draft ID') },
  }, wrap(getDraft));

  // ── Safe-mutating (reversible/additive, ungated) ──────────────────────
  server.registerTool('gmail_modify_labels', {
    description: 'Adds and/or removes labels on a message (archive, mark read/unread, star). Reversible.',
    inputSchema: {
      message_id: z.string().describe('Gmail message ID'),
      add_label_ids: z.array(z.string()).optional().describe('Label IDs to add'),
      remove_label_ids: z.array(z.string()).optional().describe('Label IDs to remove'),
    },
  }, wrap(modifyLabels));

  server.registerTool('gmail_trash_message', {
    description: 'Moves a message to Trash. Recoverable for 30 days — not gated (see gmail_delete_message for permanent deletion).',
    inputSchema: { message_id: z.string().describe('Gmail message ID') },
  }, wrap(trashMessage));

  server.registerTool('gmail_create_draft', {
    description: 'Creates a new draft. Does not send anything.',
    inputSchema: {
      to: z.array(z.string()).describe('Recipient email addresses'),
      subject: z.string().describe('Subject line'),
      body: z.string().describe('Plain-text body'),
      cc: z.array(z.string()).optional().describe('CC recipient email addresses'),
      bcc: z.array(z.string()).optional().describe('BCC recipient email addresses'),
    },
  }, wrap(createDraft));

  server.registerTool('gmail_create_label', {
    description: 'Creates a new user label. Additive and reversible via gmail_delete_label.',
    inputSchema: { name: z.string().describe('Label name, e.g. "Project X" or nested "Project X/Invoices"') },
  }, wrap(createLabel));

  // ── Gated — irreversible ──────────────────────────────────────────────
  server.registerTool('gmail_send_message', {
    description: IRREVERSIBLE_NOTICE + 'Composes and immediately sends a new email.',
    inputSchema: {
      to: z.array(z.string()).describe('Recipient email addresses'),
      subject: z.string().describe('Subject line'),
      body: z.string().describe('Plain-text body'),
      cc: z.array(z.string()).optional().describe('CC recipient email addresses'),
      bcc: z.array(z.string()).optional().describe('BCC recipient email addresses'),
    },
  }, wrap(sendMessage));

  server.registerTool('gmail_send_draft', {
    description: IRREVERSIBLE_NOTICE + 'Sends an existing draft as-is.',
    inputSchema: { draft_id: z.string().describe('Draft ID to send') },
  }, wrap(sendDraft));

  server.registerTool('gmail_reply_message', {
    description: IRREVERSIBLE_NOTICE + 'Sends a reply within an existing thread, quoting the original message.',
    inputSchema: {
      message_id: z.string().describe('Gmail message ID being replied to'),
      body: z.string().describe('Plain-text reply body'),
      reply_all: z.boolean().optional().describe('Reply to all original recipients instead of just the sender'),
    },
  }, wrap(replyMessage));

  server.registerTool('gmail_delete_message', {
    description: IRREVERSIBLE_NOTICE + 'Permanently deletes a message, bypassing Trash. Cannot be undone.',
    inputSchema: { message_id: z.string().describe('Gmail message ID') },
  }, wrap(deleteMessage));

  server.registerTool('gmail_delete_draft', {
    description: IRREVERSIBLE_NOTICE + 'Permanently deletes a draft. Cannot be undone.',
    inputSchema: { draft_id: z.string().describe('Draft ID') },
  }, wrap(deleteDraft));

  server.registerTool('gmail_delete_label', {
    description: IRREVERSIBLE_NOTICE + 'Permanently deletes a user label and removes it from every message it is applied to. Cannot be undone.',
    inputSchema: { label_id: z.string().describe('Label ID') },
  }, wrap(deleteLabel));

  return server;
}

async function main() {
  const authClient = await getAuthorizedClient();
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const server = createGmailServer(gmail);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('gmail MCP server running on stdio');
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('gmail MCP server error:', error);
    process.exit(1);
  });
}
