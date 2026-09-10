/**
 * Shared type definitions for ai-foundation's component schemas (see
 * AGENTS.md's "Component Types" section). No runtime exports — this file
 * exists purely to give Agent/Server shapes a single, predictable owner
 * that any module can reference via
 * `@param {import('./component-defs.js').AgentDef} agent`-style JSDoc,
 * instead of duplicating the shape or pointing at whichever file happens
 * to consume it.
 */

/**
 * Parsed `agents/*.yaml` content.
 * @typedef {object} AgentDef
 * @property {string} name
 * @property {string} [version]
 * @property {string} [domain]
 * @property {string} [description]
 * @property {string} [prompt]
 * @property {string[]} [tools]
 * @property {string[]} [approved_tools]
 * @property {string[]} [skills]
 * @property {string[]} [blocked_commands]
 */

/**
 * Parsed `servers/{name}/{name}.yaml` content.
 * @typedef {object} ServerDef
 * @property {string} [name]
 * @property {string} [version]
 * @property {string} protocol
 * @property {string} [transport]
 * @property {string} [description]
 * @property {string} [url]
 * @property {Record<string, string>} [headers]
 * @property {unknown} [tools]
 */

export {};
