---
name: 'feature-planning'
version: '1.0.1'
description: 'Plans a large feature as a single reviewable document with milestones and acceptance criteria, then commits it as Draft and Approved so the human can sign off before implementation.'
---

## Purpose

Turns a request or PRD for large work into one plan the human can review in a single pass, and records their approval in git so "approved" is checkable. Use it when `skill/oversight`<!-- skill-ref: ignore --> says the work is large or the level is `always`; small work needs no plan document.

## Inputs

- **Request or PRD** — what is being built and why
- **Constraints** — active standards, `.aiconfig.json` paths, existing architecture docs under `{paths.architecture}`

## Steps

### Step 1 — Draft the plan

Write `{paths.plans}/{short-name}.md` from `reference/template.md` with `Status: Draft`. Keep it as short as the work allows: one plan, no task database. The milestones are the checkpoints `skill/oversight`<!-- skill-ref: ignore --> stops at, so size each to be reviewable on its own and give each its own acceptance criteria and how it will be verified. State security and logging requirements, and list open questions rather than guessing.

### Step 2 — Commit and present

Commit the Draft with `ai-git` before presenting it ("Add draft plan: …"). A plan that exists only in chat does not count. Present it and stop; do no implementation while the status is `Draft`.

### Step 3 — Revise

Each round of requested changes is a new commit ("Revise plan: …"), never an amend or squash, and the status stays `Draft`.

### Step 4 — Record the decision

When the human explicitly decides, change the status and commit it on its own, apart from any implementation ("Approve plan: …" or "Defer plan: …"):

- **Approved** — set `Approved by`. This is the only status that unblocks implementation
- **Deferred** — the human chose to postpone. It does not unblock anything and can later return to `Draft` or go straight to `Approved`

A verbal "go ahead" in chat does not count until the Approved commit exists. To check whether work may proceed, look only for `Status: Approved`.

### Step 5 — Close out

When the described work is merged, set `Status: Done` and commit. This is informational and gates nothing.

## Outputs

- A committed plan whose status is one of `Draft`, `Approved`, `Deferred`, or `Done`
- A history showing Draft → revisions → Approved (or Deferred) as separate commits

## Edge Cases

- **The human says "just do it" for large work** — still commit the Approved status first, then proceed
- **The plan changes materially during implementation** — stop, revise the plan in a new commit, and get a fresh Approved commit before continuing
