# Decision Record: Steering Schema & Harness Adapter Scoping

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-002 |
| Project | ai-foundation |
| Status | Approved |
| Author (Agent) | Architect |
| Approved By | Jeremy |
| Created | 2026-08-01 13:55 |
| Referenced By | AIF-001 |
| Supersedes | — |

---

## Problem Statement

The steering frontmatter schema needs to support conditional loading (not all rules apply to all agents or all files) in a way that is harness-agnostic. Each harness (Kiro, Copilot, Claude Code) has its own native mechanism for scoping rules to file patterns. We need a single source-of-truth field that install adapters can translate to any target.

## Constraints & Requirements

What was non-negotiable:
- The schema must be harness-agnostic — no Kiro/Copilot/Claude-specific concepts in the source files
- Must support unconditional loading (always on) and file-pattern-conditional loading
- Must support agent/role scoping so the resolver can skip irrelevant files at install time
- Adapters must be able to mechanically translate to each harness's native format without ambiguity

What was a preference but not a hard requirement:
- Keep the schema minimal — don't add fields for features that aren't used
- Prefer explicit over implicit — frontmatter should let an agent decide "is this for me?" without reading the body

---

## Options Explored

### Option A: Kiro-native `inclusion` field

**Summary**: Use Kiro's `inclusion: "always" | "fileMatch" | "manual"` directly in steering frontmatter.
**Strengths**: Direct mapping to Kiro. Simple enum.
**Weaknesses**: Leaks a Kiro abstraction into the harness-agnostic schema. `fileMatch` doesn't carry the actual glob patterns. `manual` has no equivalent in Copilot or Claude Code. Other harnesses would need a separate translation layer that can't derive patterns from the field alone.
**Verdict**: Not chosen — harness-specific concept doesn't belong in a portable schema.

### Option B: Separate `file_patterns` array

**Summary**: Use `file_patterns: []` (always load) or `file_patterns: ["glob", ...]` (conditional). Adapters translate to each harness's native mechanism. Drop `manual` — if something isn't auto-loaded, it isn't in the bundle.
**Strengths**: Harness-agnostic. Self-contained — the patterns are right there in the frontmatter, no external lookup needed. Maps cleanly to all three harnesses. Simple rule: empty = always, populated = conditional.
**Weaknesses**: Loses Kiro's `manual` mode. (Acceptable — that use case is covered by simply not including the file in a bundle.)
**Verdict**: Chosen.

### Option C: Per-harness fields (`kiro_inclusion`, `copilot_applyTo`, `claude_paths`)

**Summary**: Each steering file declares native fields for every supported harness.
**Strengths**: No translation needed — adapters just copy the field.
**Weaknesses**: Violates harness-agnosticism. Every new harness requires editing every steering file. Steering files become cluttered with harness-specific noise.
**Verdict**: Not chosen — defeats the purpose of a portable framework.

---

## Decision

**Chosen approach**: Option B — `file_patterns` array with adapter translation

**Rationale**:
A single `file_patterns` field captures the portable intent: "this file applies unconditionally" vs "this file applies when working with these file patterns." Each harness adapter has a mechanical mapping from this field to its native format. No harness-specific concepts leak into the source schema.

**Trade-offs accepted**:
- The `manual` inclusion mode is dropped. Mitigation: files that shouldn't auto-load simply aren't included in bundles.
- Adapters need to know each harness's native format. This is expected — it's their job.

---

## Design

### Steering Frontmatter Schema

```yaml
---
name: "steering-name"
version: "0.1.0"
description: "One sentence."
file_patterns: []          # When: [] = always | ["glob", ...] = conditional
---
```

### Adapter Translation Table

| `file_patterns` value | Kiro | Copilot | Claude Code |
|---|---|---|---|
| `[]` (or omitted) | `inclusion: "always"` | `applyTo: "**"` | no `paths` field |
| `["**/*.test.js"]` | `inclusion: "fileMatch"` | `applyTo: "**/*.test.js"` | `paths: ["**/*.test.js"]` |
| `["src/**", "lib/**"]` | `inclusion: "fileMatch"` | `applyTo: "src/**, lib/**"` | `paths: ["src/**", "lib/**"]` |

### Agent/Role Scoping — Removed

The `applies_to` field was initially included to let agents skip irrelevant steering
based on frontmatter alone. It was removed because:

1. No harness supports agent-role scoping natively — all load entire files or nothing
2. Frontmatter vs body makes no difference to context consumption (whole file loads)
3. Agent-scoped steering is better handled by bundle composition (install different
   bundles for different agents) or by putting agent-specific rules in the agent's
   `prompt` field where they belong
4. The Scope section in the body already documents who the steering is for (as prose
   for human/agent comprehension), which is sufficient

---

## Impact on Planning

- Harness adapters (Phase 3+) must read `file_patterns` from steering frontmatter and emit the correct native field
- The Kiro adapter for steering must emit `inclusion: "always"` or `inclusion: "fileMatch"` in the installed file's frontmatter (or handle via Kiro's mechanism)
- The Copilot adapter wraps steering content into `.instructions.md` files with `applyTo` in frontmatter
- The Claude Code adapter writes to `.claude/rules/` with optional `paths` frontmatter
- The resolver already respects `applies_to` for filtering — no additional work needed there

---

## Resolved Items

| # | Item | Resolution |
|---|---|---|
| 1 | Whether `inclusion` or `file_patterns` is the right field name | `file_patterns` — harness-agnostic, self-contained with actual globs. |
| 2 | What happens to the `manual` case | Dropped. Files not in a bundle don't get installed. Equivalent outcome. |
| 3 | Whether `applies_to` should exist | Removed. No harness supports agent-role scoping. Whole file loads or nothing — frontmatter doesn't help skip context. Use bundle composition or agent `prompt` field instead. |
| 4 | Copilot format for conditional instructions | `.instructions.md` files with `applyTo: "glob"` in YAML frontmatter. Lives in `.github/instructions/`. |
| 5 | Claude Code format for conditional rules | `.md` files in `.claude/rules/` with optional `paths: ["glob"]` in YAML frontmatter. No paths = always loaded. |
| 6 | Kiro format for conditional steering | `.md` files in `.kiro/steering/` with `inclusion: "always"` or `inclusion: "fileMatch"` in frontmatter. **See caveat below.** |

---

## Known Limitations

### Kiro `fileMatch` is unreliable (as of Aug 2026)

Kiro's `inclusion: "fileMatch"` is documented to conditionally load steering files
when working with files matching a pattern. However:

1. **The glob pattern field is undocumented.** Kiro's official CLI docs only describe
   `inclusion: "fileMatch"` as a mode that "excludes from automatic loading" — they
   don't document how to specify *which* file patterns trigger it. Community usage
   suggests a `fileMatchPattern` frontmatter field, but this isn't in official docs.

2. **It doesn't work reliably.** GitHub issue [kirodotdev/Kiro#6171](https://github.com/kirodotdev/Kiro/issues/6171)
   (March 2026, closed as duplicate) reports that `fileMatch` steering files are
   never injected into context regardless of matching files. The issue was reported
   for both global (`~/.kiro/steering/`) and workspace-level files.

3. **The intended behaviour** (per a Medium article by an AWS consultant): the file
   loads only when Kiro reads a file matching the glob pattern. This matches how
   Copilot `applyTo` and Claude Code `paths` work — but it's not functional today.

**Impact on our adapter:**

- For `file_patterns: []` → emit no `inclusion` field or `inclusion: "always"`. This works.
- For `file_patterns: ["glob"]` → the Kiro adapter should emit `inclusion: "fileMatch"`
  with the pattern, but this may not actually trigger conditional loading in current
  Kiro versions. As a fallback, the adapter could:
  - Emit `inclusion: "always"` (load unconditionally, accept the context cost)
  - Skip installing the file entirely (safe but loses the content)
  - Emit `fileMatch` optimistically and let it work when Kiro fixes the feature

**Recommendation:** Emit `fileMatch` with the pattern. If Kiro fixes the feature,
it works automatically. If not, the file simply won't load — which is acceptable
since conditional steering is an optimization, not a correctness requirement. Files
with critical rules should use `file_patterns: []` (always load) regardless.
