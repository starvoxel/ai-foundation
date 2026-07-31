import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_NAME = basename(__dirname);
const YAML_PATH = join(__dirname, `${SERVER_NAME}.yaml`);

describe(`server: ${SERVER_NAME}`, () => {
  let definition;

  before(() => {
    const content = readFileSync(YAML_PATH, 'utf-8');
    definition = YAML.parse(content);
  });

  // ── Integration tests ──────────────────────────────────────────────────────
  // Implement when the server is runnable.
  // Schema validation lives in tests/schemas.test.js — not here.

  // let server;
  //
  // before(async () => {
  //   // Start the server process (stdio or http based on transport field)
  //   // Wait for ready signal
  // });
  //
  // after(async () => {
  //   // Gracefully shut down the server
  // });
  //
  // it('starts without error', async () => {
  //   assert.ok(server, 'Server did not start');
  // });
  //
  // it('lists all declared tools', async () => {
  //   // Send tools/list request
  //   // Verify every tool from definition.tools is present in response
  // });
  //
  // describe('tool invocation', () => {
  //   // One test per tool declared in the YAML
  //   // for (const tool of definition.tools) {
  //   //   it(`${tool.name} responds to valid input`, async () => {
  //   //     // Call tool with minimal valid params
  //   //     // Verify response is not an error
  //   //   });
  //   // }
  // });
});
