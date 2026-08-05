/**
 * DAG MCP server — validates and computes execution waves from epic chunk
 * dependency graphs.
 *
 * Plan ID: engineering-manager-plan (Phase 1)
 */

import { readFileSync } from 'node:fs';

// ── Pure Logic ───────────────────────────────────────────────────────────────

/**
 * Parse the Section 8 chunk table from epic plan markdown.
 * Expects rows like: | 001 | Title | None | 002 | Software-Engineer |
 *
 * @param {string} content - Epic plan markdown content
 * @returns {Array<{ id: string, title: string, depends_on: string[], parallel_with: string[], agents: string[] }>}
 */
export function parseChunkTable(content) {
  const lines = content.split(/\r?\n/);
  const chunks = [];

  let inSection8 = false;
  let headerPassed = false;

  for (const line of lines) {
    // Detect Section 8 start
    if (/^##\s+8\.\s+Chunk Decomposition/i.test(line)) {
      inSection8 = true;
      continue;
    }

    // Stop at next section
    if (inSection8 && /^##\s+\d+\./.test(line) && !/^##\s+8\./.test(line)) {
      break;
    }

    if (!inSection8) continue;

    // Skip non-table lines
    if (!line.trim().startsWith('|')) continue;

    // Skip header separator (|---|---|...)
    if (/^\|\s*-+/.test(line)) {
      headerPassed = true;
      continue;
    }

    // Skip the header row itself
    if (!headerPassed) continue;

    const cells = line.split('|')
      .slice(1, -1) // Remove leading/trailing empty splits
      .map(c => c.trim());

    if (cells.length < 5) continue;

    const [id, title, dependsOn, parallelWith, agents] = cells;

    chunks.push({
      id: id.trim(),
      title: title.trim(),
      depends_on: parseList(dependsOn),
      parallel_with: parseList(parallelWith),
      agents: parseList(agents),
    });
  }

  return chunks;
}

/**
 * Parse a comma/space-separated list or "None" into an array.
 * @param {string} value
 * @returns {string[]}
 */
export function parseList(value) {
  if (!value || /^none$/i.test(value.trim()) || value.trim() === '—' || value.trim() === '-') {
    return [];
  }
  return value.split(/[,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Build an adjacency list from parsed chunks.
 * @param {Array<{ id: string, depends_on: string[] }>} chunks
 * @returns {{ nodes: Set<string>, edges: Map<string, string[]> }}
 */
export function buildGraph(chunks) {
  const nodes = new Set(chunks.map(c => c.id));
  const edges = new Map();

  for (const chunk of chunks) {
    edges.set(chunk.id, chunk.depends_on);
  }

  return { nodes, edges };
}

/**
 * Validate that a graph is a valid DAG.
 * Checks: no cycles, no references to non-existent chunks.
 *
 * @param {{ nodes: Set<string>, edges: Map<string, string[]> }} graph
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(graph) {
  const { nodes, edges } = graph;
  const errors = [];

  // Check for missing references
  for (const [node, deps] of edges) {
    for (const dep of deps) {
      if (!nodes.has(dep)) {
        errors.push(`Chunk "${node}" depends on "${dep}" which does not exist`);
      }
    }
  }

  // Cycle detection via Kahn's algorithm
  const inDegree = new Map();
  for (const node of nodes) {
    inDegree.set(node, 0);
  }

  for (const [, deps] of edges) {
    // deps are predecessors of this node, so this node has inDegree from each dep
    // Actually: edges maps node -> its dependencies (predecessors)
    // For topo sort, we need: for each dep -> node, dep must come before node
  }

  // Rebuild as forward adjacency: dep -> [nodes that depend on it]
  const forward = new Map();
  for (const node of nodes) {
    forward.set(node, []);
  }
  for (const [node, deps] of edges) {
    for (const dep of deps) {
      if (nodes.has(dep)) {
        forward.get(dep).push(node);
      }
    }
    inDegree.set(node, deps.filter(d => nodes.has(d)).length);
  }

  const queue = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    visited++;
    for (const neighbor of forward.get(current) || []) {
      const newDegree = inDegree.get(neighbor) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (visited < nodes.size) {
    const cycleNodes = [...nodes].filter(n => inDegree.get(n) > 0);
    errors.push(`Cycle detected involving chunks: ${cycleNodes.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute execution waves via topological sort grouped by depth.
 * Each wave contains chunks whose dependencies are all in earlier waves.
 *
 * @param {{ nodes: Set<string>, edges: Map<string, string[]> }} graph
 * @returns {string[][]} Array of waves, each wave is an array of chunk IDs
 */
export function computeWaves(graph) {
  const { nodes, edges } = graph;

  // Build forward adjacency and in-degree
  const forward = new Map();
  const inDegree = new Map();
  for (const node of nodes) {
    forward.set(node, []);
    inDegree.set(node, 0);
  }
  for (const [node, deps] of edges) {
    for (const dep of deps) {
      if (nodes.has(dep)) {
        forward.get(dep).push(node);
      }
    }
    inDegree.set(node, deps.filter(d => nodes.has(d)).length);
  }

  const waves = [];
  let remaining = new Set(nodes);

  while (remaining.size > 0) {
    // Current wave: all nodes with in-degree 0 among remaining
    const wave = [];
    for (const node of remaining) {
      if (inDegree.get(node) === 0) {
        wave.push(node);
      }
    }

    if (wave.length === 0) {
      // Cycle — shouldn't reach here if validate() was called first
      break;
    }

    waves.push(wave.sort()); // Sort for deterministic output

    // Remove wave nodes and update in-degrees
    for (const node of wave) {
      remaining.delete(node);
      for (const neighbor of forward.get(node) || []) {
        inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      }
    }
  }

  return waves;
}

// ── I/O Layer ────────────────────────────────────────────────────────────────

/**
 * Read and parse an epic file's chunk table.
 * @param {string} epicPath
 * @returns {Array<{ id: string, title: string, depends_on: string[], parallel_with: string[], agents: string[] }>}
 */
export function readEpicChunks(epicPath) {
  const content = readFileSync(epicPath, 'utf-8');
  return parseChunkTable(content);
}

/**
 * Tool: dag_validate — validates an epic's chunk DAG.
 * @param {string} epicPath
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function dagValidate(epicPath) {
  const chunks = readEpicChunks(epicPath);
  if (chunks.length === 0) {
    return { valid: false, errors: ['No chunk table found in Section 8'] };
  }
  const graph = buildGraph(chunks);
  return validate(graph);
}

/**
 * Tool: dag_compute_waves — computes execution waves from an epic's chunk DAG.
 * @param {string} epicPath
 * @returns {{ waves: string[][], chunks: Array<{ id: string, title: string, depends_on: string[], agents: string[] }> }}
 */
export function dagComputeWaves(epicPath) {
  const chunks = readEpicChunks(epicPath);
  if (chunks.length === 0) {
    return { waves: [], chunks: [] };
  }
  const graph = buildGraph(chunks);
  const validation = validate(graph);
  if (!validation.valid) {
    return { waves: [], chunks, errors: validation.errors };
  }
  const waves = computeWaves(graph);
  return {
    waves,
    chunks: chunks.map(c => ({
      id: c.id,
      title: c.title,
      depends_on: c.depends_on,
      agents: c.agents,
    })),
  };
}
