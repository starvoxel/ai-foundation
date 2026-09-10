#!/usr/bin/env node
/**
 * DAG MCP server — stdio entry point.
 *
 * Wraps the pure dag-validate and dag-compute-waves tools in the MCP protocol
 * using @modelcontextprotocol/sdk. This is the file that gets spawned by the
 * MCP host (e.g. Kiro) via stdio transport.
 *
 * Plan ID: engineering-manager-plan (Phase 1)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { dagValidate, dagComputeWaves } from './logic.js';

const server = new McpServer({
  name: 'dag',
  version: '0.2.0',
});

server.registerTool(
  'dag-validate',
  {
    description:
      'Validates that a chunks.json file forms a valid DAG (acyclic, no missing refs, correct schema).',
    inputSchema: {
      chunks_path: z.string().describe('Path to the chunks.json file'),
    },
  },
  async ({ chunks_path }) => {
    const result = dagValidate(chunks_path);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  'dag-compute-waves',
  {
    description:
      'Computes execution waves from a chunks.json dependency graph via topological sort.',
    inputSchema: {
      chunks_path: z.string().describe('Path to the chunks.json file'),
    },
  },
  async ({ chunks_path }) => {
    const result = dagComputeWaves(chunks_path);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('DAG MCP server running on stdio');
}

main().catch((error) => {
  console.error('DAG MCP server error:', error);
  process.exit(1);
});
