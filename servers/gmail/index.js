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
import { pathToFileURL } from 'node:url';

import { getAuthorizedClient } from './auth.js';
import {
  listMessages,
  getMessage,
  getAttachment,
  listLabels,
  listDrafts,
  getDraft,
  listFilters,
  senderReport,
  modifyLabels,
  trashMessage,
  createDraft,
  createLabel,
  createFilter,
  deleteFilter,
  batchModifyLabels,
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
 * Build the MCP server with all tools registered.
 *
 * Accepts either a ready Gmail API client (tests pass a fake client object
 * directly) or an async factory `() => Promise<gmail_v1.Gmail>` (index.js's
 * runtime path). The factory form lets the server connect and list tools
 * immediately at startup, deferring OAuth (and any "run authorize.js first"
 * error) until a tool is actually invoked — a missing/invalid token must not
 * prevent the server from loading.
 *
 * @param {import('googleapis').gmail_v1.Gmail | (() => Promise<import('googleapis').gmail_v1.Gmail>)} gmailOrFactory
 */
export function createGmailServer(gmailOrFactory) {
  const server = new McpServer({ name: 'gmail', version: SERVER_VERSION });

  const asText = (result) => ({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
  const asError = (err) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
    isError: true,
  });
  const wrap = (fn) => async (args) => {
    try {
      const gmail = typeof gmailOrFactory === 'function' ? await gmailOrFactory() : gmailOrFactory;
      return asText(await fn(gmail, args));
    } catch (err) {
      return asError(err);
    }
  };

  // ── Read-only ──────────────────────────────────────────────────────────
  server.registerTool('gmail-list-messages', {
    description: 'Lists/searches messages matching a Gmail search query, with optional label filter and pagination.',
    inputSchema: {
      query: z.string().optional().describe('Gmail search query'),
      label_ids: z.array(z.string()).optional().describe('Restrict to messages having all of these label IDs'),
      max_results: z.number().optional().describe('Maximum messages to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
  }, wrap(listMessages));

  server.registerTool('gmail-get-message', {
    description: 'Fetches full content and headers of a single message by ID.',
    inputSchema: {
      message_id: z.string().describe('Gmail message ID'),
      format: z.enum(['full', 'metadata']).optional().describe("'full' or 'metadata'"),
    },
  }, wrap(getMessage));

  server.registerTool('gmail-get-attachment', {
    description: "Downloads a single attachment's content from a message.",
    inputSchema: {
      message_id: z.string().describe('Gmail message ID'),
      attachment_id: z.string().describe('Attachment ID from gmail-get-message output'),
    },
  }, wrap(getAttachment));

  server.registerTool('gmail-list-labels', {
    description: 'Lists all labels (system and user-created) in the mailbox.',
    inputSchema: {},
  }, wrap(listLabels));

  server.registerTool('gmail-list-drafts', {
    description: 'Lists existing drafts.',
    inputSchema: {
      max_results: z.number().optional().describe('Maximum drafts to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
  }, wrap(listDrafts));

  server.registerTool('gmail-get-draft', {
    description: 'Fetches full content of a single draft by ID.',
    inputSchema: { draft_id: z.string().describe('Draft ID') },
  }, wrap(getDraft));

  server.registerTool('gmail-list-filters', {
    description: 'Lists all existing Gmail filters. Check before creating a new one to avoid duplicates.',
    inputSchema: {},
  }, wrap(listFilters));

  server.registerTool('gmail-sender-report', {
    description: "Convenience/discovery tool, not a dependency of any other tool: aggregates messages matching a query by sender (From/Subject metadata only, never bodies). If removed, the same result is obtainable via gmail-list-messages + gmail-get-message(format:'metadata') per message.",
    inputSchema: {
      query: z.string().optional().describe('Gmail search query restricting which messages to aggregate'),
      max_senders: z.number().optional().describe('Maximum number of senders to return, ranked by count descending'),
    },
  }, wrap(senderReport));

  // ── Safe-mutating (reversible/additive, ungated) ──────────────────────
  server.registerTool('gmail-modify-labels', {
    description: 'Adds and/or removes labels on a message (archive, mark read/unread, star). Reversible.',
    inputSchema: {
      message_id: z.string().describe('Gmail message ID'),
      add_label_ids: z.array(z.string()).optional().describe('Label IDs to add'),
      remove_label_ids: z.array(z.string()).optional().describe('Label IDs to remove'),
    },
  }, wrap(modifyLabels));

  server.registerTool('gmail-trash-message', {
    description: 'Moves a message to Trash. Recoverable for 30 days — not gated (see gmail-delete-message for permanent deletion).',
    inputSchema: { message_id: z.string().describe('Gmail message ID') },
  }, wrap(trashMessage));

  server.registerTool('gmail-create-draft', {
    description: 'Creates a new draft. Does not send anything.',
    inputSchema: {
      to: z.array(z.string()).describe('Recipient email addresses'),
      subject: z.string().describe('Subject line'),
      body: z.string().describe('Plain-text body'),
      cc: z.array(z.string()).optional().describe('CC recipient email addresses'),
      bcc: z.array(z.string()).optional().describe('BCC recipient email addresses'),
    },
  }, wrap(createDraft));

  server.registerTool('gmail-create-label', {
    description: 'Creates a new user label. Additive and reversible via gmail-delete-label.',
    inputSchema: { name: z.string().describe('Label name, e.g. "Project X" or nested "Project X/Invoices"') },
  }, wrap(createLabel));

  server.registerTool('gmail-create-filter', {
    description: 'Creates a Gmail filter (auto-apply-label rule). Only affects future mail — use gmail-batch-modify-labels to backfill history. Additive, reversible via gmail-delete-filter.',
    inputSchema: {
      from: z.string().optional().describe('Match sender address'),
      to: z.string().optional().describe('Match recipient address'),
      subject: z.string().optional().describe('Match subject text'),
      query: z.string().optional().describe('Raw Gmail search string to match'),
      negated_query: z.string().optional().describe('Raw Gmail search string that must NOT match'),
      has_attachment: z.boolean().optional().describe('Match only messages with an attachment'),
      exclude_chats: z.boolean().optional().describe('Exclude chat messages from matching'),
      size: z.number().optional().describe('Match messages by size in bytes, used with size_comparison'),
      size_comparison: z.enum(['larger', 'smaller', 'unspecified']).optional().describe('Paired with size'),
      add_label_ids: z.array(z.string()).optional().describe('Label IDs to apply to matching messages'),
      remove_label_ids: z.array(z.string()).optional().describe('Label IDs to remove from matching messages'),
      forward: z.string().optional().describe('Email address to forward matching messages to'),
    },
  }, wrap(createFilter));

  server.registerTool('gmail-delete-filter', {
    description: 'Deletes a Gmail filter (the rule only, not labels already applied). Not gated — trivially recreatable via gmail-create-filter.',
    inputSchema: { filter_id: z.string().describe('Filter ID') },
  }, wrap(deleteFilter));

  server.registerTool('gmail-batch-modify-labels', {
    description: 'Adds and/or removes labels across many messages in one call, chunking internally at the API\'s 1000-message limit. Reversible.',
    inputSchema: {
      message_ids: z.array(z.string()).describe('Gmail message IDs to modify'),
      add_label_ids: z.array(z.string()).optional().describe('Label IDs to add'),
      remove_label_ids: z.array(z.string()).optional().describe('Label IDs to remove'),
    },
  }, wrap(batchModifyLabels));

  // ── Gated — irreversible ──────────────────────────────────────────────
  server.registerTool('gmail-send-message', {
    description: IRREVERSIBLE_NOTICE + 'Composes and immediately sends a new email.',
    inputSchema: {
      to: z.array(z.string()).describe('Recipient email addresses'),
      subject: z.string().describe('Subject line'),
      body: z.string().describe('Plain-text body'),
      cc: z.array(z.string()).optional().describe('CC recipient email addresses'),
      bcc: z.array(z.string()).optional().describe('BCC recipient email addresses'),
    },
  }, wrap(sendMessage));

  server.registerTool('gmail-send-draft', {
    description: IRREVERSIBLE_NOTICE + 'Sends an existing draft as-is.',
    inputSchema: { draft_id: z.string().describe('Draft ID to send') },
  }, wrap(sendDraft));

  server.registerTool('gmail-reply-message', {
    description: IRREVERSIBLE_NOTICE + 'Sends a reply within an existing thread, quoting the original message.',
    inputSchema: {
      message_id: z.string().describe('Gmail message ID being replied to'),
      body: z.string().describe('Plain-text reply body'),
      reply_all: z.boolean().optional().describe('Reply to all original recipients instead of just the sender'),
    },
  }, wrap(replyMessage));

  server.registerTool('gmail-delete-message', {
    description: IRREVERSIBLE_NOTICE + 'Permanently deletes a message, bypassing Trash. Cannot be undone.',
    inputSchema: { message_id: z.string().describe('Gmail message ID') },
  }, wrap(deleteMessage));

  server.registerTool('gmail-delete-draft', {
    description: IRREVERSIBLE_NOTICE + 'Permanently deletes a draft. Cannot be undone.',
    inputSchema: { draft_id: z.string().describe('Draft ID') },
  }, wrap(deleteDraft));

  server.registerTool('gmail-delete-label', {
    description: IRREVERSIBLE_NOTICE + 'Permanently deletes a user label and removes it from every message it is applied to. Cannot be undone.',
    inputSchema: { label_id: z.string().describe('Label ID') },
  }, wrap(deleteLabel));

  return server;
}

async function main() {
  // Memoized factory: the server connects and lists tools immediately even
  // if OAuth setup hasn't happened yet. Auth is only attempted (and only
  // fails) when a tool is actually called.
  let gmailClient;
  const getGmail = async () => {
    if (!gmailClient) {
      const authClient = await getAuthorizedClient();
      gmailClient = google.gmail({ version: 'v1', auth: authClient });
    }
    return gmailClient;
  };

  const server = createGmailServer(getGmail);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('gmail MCP server running on stdio');
}

// Only run when invoked directly (not when imported by tests). Compared as
// file:// URLs (via pathToFileURL) rather than string concatenation, since
// process.argv[1] is a native path (backslashes on Windows) and naive
// `file://${...}` concatenation never matches import.meta.url there.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('gmail MCP server error:', error);
    process.exit(1);
  });
}
