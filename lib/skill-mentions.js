// ------------------------------
// skill-mentions.js
//
// Author: Starvoxel AI Agent - 2026-10-05
// Plan: AIF-006
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Skill-mention classifier and checker — pure, no I/O.
 *
 * A "mention" is any `skill/<name>` in prose. Each mention is classified:
 *
 *   - reference: an inline code span holding exactly `skill/<name>`. Must name
 *                an existing skill covered by the file's requires_skills
 *                closure (error otherwise).
 *   - example:   inside a longer inline code span, or followed immediately by
 *                the ignore marker. Ignored.
 *   - other:     any other mention (plain prose, frontmatter description).
 *                Reported as a warning.
 *
 * Fenced code blocks never reach the classifier (callers drop them via
 * `nonFencedLines`). A skill's own name is never a mention of itself.
 */

import { nonFencedLines } from './file-utils.js';

/** The marker that turns a mention into an ignored example. Must follow the span immediately. */
export const SKILL_REF_IGNORE_MARKER = '<!-- skill-ref: ignore -->';

const MENTION_RE = /(?<![\w/.-])skill\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g;
const CODE_SPAN_RE = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;

/**
 * @typedef {'reference'|'example'|'other'} MentionClass
 * @typedef {{ name: string, cls: MentionClass }} SkillMention
 */

/**
 * Classify every `skill/<name>` mention on one (non-fenced) line.
 * @param {string} line
 * @param {{ ownName?: string }} [options] - `ownName`: the skill this line belongs
 *   to; mentions of it are dropped (never a reference to itself)
 * @returns {SkillMention[]} In order of appearance
 */
export function classifySkillMentions(line, { ownName } = {}) {
  const spans = [];
  CODE_SPAN_RE.lastIndex = 0;
  let s;
  while ((s = CODE_SPAN_RE.exec(line))) {
    spans.push({ start: s.index, end: s.index + s[0].length, inner: s[2] });
  }

  const mentions = [];
  MENTION_RE.lastIndex = 0;
  let m;
  while ((m = MENTION_RE.exec(line))) {
    const name = m[1];
    const end = m.index + m[0].length;
    if (line[end] === '/') continue; // part of a longer path/word list, not a skill ref
    if (name === ownName) continue;

    const span = spans.find((sp) => m.index >= sp.start && end <= sp.end);
    if (span) {
      const exact = span.inner.trim() === `skill/${name}`;
      const marked = line.startsWith(SKILL_REF_IGNORE_MARKER, span.end);
      mentions.push({ name, cls: exact && !marked ? 'reference' : 'example' });
    } else {
      const marked = line.startsWith(SKILL_REF_IGNORE_MARKER, end);
      mentions.push({ name, cls: marked ? 'example' : 'other' });
    }
  }
  return mentions;
}

/**
 * Line numbers (1-indexed) of the `requires_skills` block inside a file's
 * frontmatter — declarations, not mentions, so they are never scanned.
 * @param {string} content
 * @returns {Set<number>}
 */
export function requiresSkillsLines(content) {
  const skip = new Set();
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return skip;
  let inBlock = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    if (/^requires_skills:/.test(lines[i])) inBlock = true;
    else if (/^\S/.test(lines[i])) inBlock = false;
    if (inBlock) skip.add(i + 1);
  }
  return skip;
}

/**
 * Check every mention in a file's content against the skills that exist and
 * the skills its `requires_skills` closure covers.
 * @param {string} content - Raw file content
 * @param {object} options
 * @param {string} options.label - File label for messages, e.g. "skills/x/SKILL.md"
 * @param {string} [options.ownName] - Owning skill name (self-mentions are skipped)
 * @param {Set<string>} options.covered - Closure of the file's requires_skills
 * @param {(name: string) => boolean} options.skillExists
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkSkillMentions(content, { label, ownName, covered, skillExists }) {
  const errors = [];
  const warnings = [];
  const declarationLines = requiresSkillsLines(content);

  for (const { line, lineNumber } of nonFencedLines(content)) {
    if (!line.includes('skill/') || declarationLines.has(lineNumber)) continue;
    for (const { name, cls } of classifySkillMentions(line, { ownName })) {
      const loc = `${label}:${lineNumber}`;
      if (cls === 'reference') {
        if (!skillExists(name)) {
          errors.push(`${loc}: reference to non-existent skill/${name}`);
        } else if (!covered.has(name)) {
          errors.push(
            `${loc}: reference to skill/${name} is not covered by requires_skills (declare it, or add ${SKILL_REF_IGNORE_MARKER} after the span)`,
          );
        }
      } else if (cls === 'other') {
        warnings.push(
          `${loc}: unformatted mention of skill/${name} (use a \`skill/${name}\` code span, or add ${SKILL_REF_IGNORE_MARKER})`,
        );
      }
    }
  }
  return { errors, warnings };
}
