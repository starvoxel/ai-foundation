---
name: "decision-brief"
version: "0.1.0"
description: "Produces a slim Tier B Decision Brief for structural decisions that don't need full options-exploration ceremony."
---

## Purpose

Captures a Tier B ("Structural") decision — one with a plausible future cross-plan citation, per AIF-META-001's promotion threshold, but not a multi-option architectural trade-off — without the full options-exploration ceremony of `skill/decision-record`. Produces a durable record, discoverable via `docs/decisions/index.json` once `aif index decisions` (AIF-002-014) next regenerates it, lighter than a Tier A Decision Record but heavier than a Tier C inline note. Normally invoked by `skill/decision-triage` once it has already selected Tier B and determined Domain; may also be invoked directly by an agent that already knows a decision is Tier B (see Edge Cases).

---

## Inputs

- **Problem statement** — what question this decision answers
- **The decision already made** — Tier B skips options-exploration; the brief documents what was decided and why, not a menu of alternatives to evaluate
- **Domain** — one of Architecture, Process, Planning, AI-component, Quality, Testing, Meta-process, per AIF-META-001's ownership table (determines both the folder/ID prefix and, normally, the authoring agent)
- **Project context** — existing stack, standards, relevant repo patterns needed to state the Rationale/Impact accurately

---

## Steps

### Step 1 — Confirm Tier B Fits

Sanity-check against AIF-META-001's promotion threshold before writing. If a genuine multi-option trade-off with lasting cross-component impact is discovered, stop and escalate to `skill/decision-record` (Tier A) instead of force-fitting the slim skeleton.
If actually no plausible second citation exists, escalate down to the Tier C inline convention instead (`skill/chunk-planning`/`skill/epic-planning`) — do not write a standalone file for a decision that doesn't need one.

### Step 2 — Write the Decision Brief

Write the record using the template at `skills/decision-brief/reference/template.md`. Exactly five sections — Metadata (including `Tier: B`, `Domain`, and `Tags` if applicable), Problem, Decision, Rationale, Impact. No Options Explored, Design, or Constraints & Requirements sections. Ensure the Metadata table is complete and accurate — this is the sole source `aif index decisions` (AIF-002-014) reads when it later builds `docs/decisions/index.json`.

### Step 3 — Follow the Abbreviated Commit-Gate Procedure

Commit the Brief with `Status: Draft` via `ai-git`, present it to the human for confirmation. On confirmation, update `Status: Approved` and the approver field, and commit that as its own commit — a lighter, expected one-shot cycle (Draft → confirm → Approved) rather than `decision-record`'s full multi-round options-exploration review, though a revision round remains available and should be followed exactly like `skill/plan-lifecycle`'s standard Step 3 if the human requests changes instead of confirming outright.

---

## Outputs

- **Decision Brief** — markdown file following the template format
- **Location:** `{paths.decisions}/{domain-folder}/{ProjectID}-{DomainCode}-{###}_{ShortTitle}.decision.md` (from `.aiconfig.json`; falls back to `docs/decisions/` if `paths.decisions` is unset, consistent with `skill/decision-record`'s existing fallback convention)
- **Note:** `{paths.decisions}/index.json` is not produced by this skill. It is a
  generated artifact, rebuilt by running `aif index decisions` (see AIF-002-014),
  which reads every record's Metadata table directly (Tier A and Tier B
  alike) — this skill's only obligation toward the index is keeping that
  table accurate.

---

## Edge Cases

- **Decision turns out to need Options-Explored ceremony mid-write** — stop, do not force the slim skeleton; escalate to `skill/decision-record` (Tier A)
  instead.
- **Decision turns out not to need independent discoverability at all** — stop, do not create a standalone file; point back to the Tier C inline-recording convention instead.
- **Invoked directly, without going through `skill/decision-triage` first** — the invoking agent must still determine Domain per AIF-META-001's ownership table before writing; do not default to a Domain arbitrarily.
- **Domain is genuinely ambiguous** — select the closest matching domain, note the ambiguity in the Impact section rather than blocking; if it materially affects who should author the record, raise it to the human (global Rule 2).
- **Human disagrees with the drafted content during confirmation** — update the Brief with their input and continue the (unexpected but not prohibited)
  revision round per `skill/plan-lifecycle` Step 3, same as Tier A.
