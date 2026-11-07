#!/usr/bin/env node
/**
 * Trial-only hook: append each trigger-tool hook payload to
 * `scratch/trigger-hook-log.jsonl` (gitignored) so the real `tool_input` and
 * `tool_response` shapes can be read. Logs only; never blocks (always exits 0).
 * Remove together with the matching entries in `.claude/settings.json`.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** @param {string} raw @returns {object} */
export function toLogEntry(raw, now = new Date()) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ts: now.toISOString(), parse_error: true, raw: raw.slice(0, 2000) };
  }
  return { ts: now.toISOString(), payload };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const root = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const file = join(root, 'scratch', 'trigger-hook-log.jsonl');
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(toLogEntry(await readStdin()))}\n`);
}

main().catch((err) => {
  process.stderr.write(`trigger-hook-log: ${err.message}\n`);
});
