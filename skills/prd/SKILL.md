---
name: 'prd'
version: '1.0.0'
description: 'Interviews the human about a product or feature idea and writes a short, testable product requirements doc, ready to feed feature-planning or direct implementation.'
---

## Purpose

Turns an idea into a one-page requirements document by asking the questions that change what gets built, instead of guessing. Use it when a request is about what to build and for whom, not yet how. A requirement a test could check is the goal.

## Inputs

- **The idea** — whatever the human has: a sentence, notes, a pasted brief
- **Existing context** — the repo, `{paths.architecture}` docs, and any earlier PRDs under `{paths.product}`, read before asking anything

## Steps

### Step 1 — Read before asking

Check the repo and existing docs for answers first. Do not ask what the code or an earlier PRD already says. If the idea depends on outside facts (a market, a third-party API), ask the human to approve a researcher dispatch rather than searching the web yourself.

### Step 2 — Interview

Ask with `ask_user`, in batches of at most four questions, each with two to four concrete options and your recommended default first. Cover only what is still unknown: the problem and who has it, the one or two scenarios that matter most, what is explicitly out of scope, constraints (platform, data, security, deadlines), and how success will be judged. Stop when each requirement can be stated so a test could check it. If the human says to use your judgment, proceed on stated assumptions and list them.

### Step 3 — Write the PRD

Fill `reference/template.md` into `{paths.product}/{short-name}.md` (default `knowledge/product/`). Keep it to about a page. Number each requirement, make it testable, and mark a priority. Put every unresolved item in Open questions with who decides.

### Step 4 — Review and hand off

Present the PRD and apply the human's changes. Commit it normally; it is a living document and needs no approval commit. Then recommend the next step: `skill/feature-planning`<!-- skill-ref: ignore --> for large work, or implementation directly for small work, per `skill/oversight`<!-- skill-ref: ignore -->.

## Outputs

- `{paths.product}/{short-name}.md`, plus the list of assumptions made on the human's behalf

## Edge Cases

- **A PRD for this idea already exists** — update it instead of writing a second one
- **The human wants to skip the interview** — write from what they gave you, mark every inferred requirement as an assumption, and keep Open questions honest
- **Requirements conflict with the architecture docs or standards** — raise it; do not quietly resolve it
