---
name: "decision-record"
version: "0.3.0"
description: "Produces a structured Tier A ('Researched') Decision Record capturing options explored and the chosen approach. Invoked by skill/decision-triage, or directly by an agent that already knows it needs Tier A."
---

## Purpose

This skill is scoped to Tier A ("Researched") decisions only — see
AIF-META-001's Tier definitions. Tier B ("Structural") decisions use
skill/decision-brief; Tier C ("Embedded") decisions are recorded inline per
skill/chunk-planning / skill/epic-planning and never reach this skill. This
skill is normally invoked by skill/decision-triage after it has already
selected Tier A and determined the Domain; an agent that already knows with
certainty it needs a Tier A record for a specific Domain may invoke this skill
directly.

Captures a technical decision with full context: the problem, constraints, options explored, trade-offs, and the chosen approach with rationale. Creates a durable record that planning agents reference and humans review.

---

## Inputs

- **Problem statement** — what question needs answering
- **Constraints** — non-negotiable requirements and preferences
- **Project context** — existing stack, standards, relevant codebase patterns
- **Clarification answers** — if ambiguity was resolved via questions

---

## Steps

### Step 1 (NEW) — Confirm Tier A and Determine Domain

If not already triaged via `skill/decision-triage`, confirm Tier A genuinely applies (a genuine multi-option trade-off with lasting cross-component impact — the AIF-META-001 promotion-threshold test #1). Determine the Domain from AIF-META-001's Domain ownership table (Architecture/`ARCH`, Process/`PROC`, Planning/`PLAN`, AI-component/`AIC`, Quality/`QA`, Testing/`TEST`, Meta-process/`META`) and load the matching stub from `reference/domain-guidance.md` for use when writing `Design`/`Impact on Planning` in Step 4. If the decision doesn't clearly belong to exactly one domain, select the closest match and note the ambiguity in `Impact on Planning`/`Design` rather than blocking (see Edge Cases).

### Step 2 — Generate Options

Propose 2-4 genuinely distinct approaches. For each:
- Name it clearly
- Describe it in plain language
- State strengths in this specific context
- State weaknesses or costs
- Assess against relevant criteria (complexity, testability, performance, etc.)

### Step 3 — Recommend

State which option is recommended and why, grounded in the stated constraints.
If genuinely too close to call, identify the one question that would break the tie.

### Step 4 — Write the Decision Record

Write the record using the template at `skills/decision-record/reference/template.md`, applying the domain guidance loaded in Step 1 to the `Design`/`Impact on Planning` sections. Ensure the Metadata table (including `Tier`, `Domain`, `References`, and `Tags` if applicable) is complete and accurate — this is the sole source `aif index decisions` (AIF-002-014) reads when it later builds `{paths.decisions}/index.json`. `References`/`Referenced By` may cite either another Decision ID or an Epic ID (e.g. for implementation-tracking, linking this decision to the Epic that implements it) — see `reference/template.md` for the two ID shapes.

### Step 5 — Follow the Commit-Gate Procedure

Follow `skill/plan-lifecycle` to save the record with `Status: Draft`, commit it, and present it for human confirmation. The human confirms before it is finalized — do not treat the record as authoritative until the human's decision (`Approved`, `Deferred`, or later `Superseded`) is committed.

---

## Outputs

- **Decision Record** — markdown file following the template format
- **Location:** `{paths.decisions}/{domain-folder}/{ID}_{ShortTitle}.decision.md`
  (`paths.decisions` from `.aiconfig.json`; if unset, derived as
  `{resolved paths.knowledge}/decisions` — i.e. `knowledge/decisions/` only in
  the nested case where `paths.knowledge` is also unset, per AIF-002-014's
  `resolveDecisionsPath`, not a flat default;
  `{domain-folder}` is the lowercase Domain value — `architecture/`, `process/`,
  `planning/`, `ai-component/`, `quality/`, `testing/`, `meta-process/`; `{ID}`
  is `{ProjectID}-{DomainCode}-{###}`, e.g. `AIF-ARCH-004`, `AIF-PROC-002`,
  counter scoped per `(project, domain)` pair)
- **Note:** `{paths.decisions}/index.json` is not produced by this skill. It is a
  generated artifact, rebuilt by running `aif index decisions` (see AIF-002-014),
  which reads every record's Metadata table directly — this skill's only
  obligation toward the index is keeping that table accurate.

---

## Edge Cases

- **Human disagrees with recommendation** — update the Decision Record with their choice and rationale. The record captures what was decided, not what was recommended.
- **No clear winner** — explicitly state the tie-breaking question. Do not force a recommendation without evidence.
- **Decision deferred** — still produce the record, set `Status: Deferred`, and document why. See `skill/plan-lifecycle` — a `Deferred` record is not approved and must not be referenced as if it were.
- **Decision involves a schema, data shape, or architecture worth spelling out** — include the `## Design` section (between `Decision` and `Impact on Planning`). Omit it for simpler decisions with nothing concrete to document.
- **Closing section** — use `## Resolved Items` if every open question raised during the decision was answered by the time the record was written. Use `## Open Items` if questions remain unresolved. A record may include either or, if genuinely warranted, both — but never neither.
- **Decision doesn't clearly belong to exactly one domain** — select the
  closest matching domain per Step 1 and note the ambiguity in `Impact on
  Planning`/`Design`. If genuinely unclear and materially affects who should
  author the record, raise to the human rather than guessing (global Rule 2).
