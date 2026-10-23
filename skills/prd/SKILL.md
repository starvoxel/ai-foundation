---
name: 'prd'
version: '1.1.0'
description: 'Interviews the human about a product or feature idea — first the overall scope, then the details of each feature area — and writes a testable product requirements doc, ready to feed feature-planning or direct implementation.'
---

## Purpose

Turns an idea into a requirements document by asking the questions that change what gets built, instead of guessing. Use it when a request is about what to build and for whom, not yet how. The document is as long as the product needs, but each requirement is terse and testable.

## Inputs

- **The idea** — whatever the human has: a sentence, notes, a pasted brief
- **Existing context** — the repo, `{paths.architecture}` docs, and earlier PRDs under `{paths.product}`, read before asking anything

## Steps

### Step 1 — Read before asking

Check the repo and existing docs for answers first, and do not ask what they already say. If the idea depends on outside facts (a market, a third-party API), ask the human to approve a researcher dispatch rather than searching the web yourself.

### Step 2 — Establish the scope

Interview with `ask_user`, in batches of three to five questions, each with two to four concrete options and your recommended default first. Cover the big picture only: the problem and who has it, the main users, the major capabilities (these become the feature areas), what is explicitly out of scope, platforms and hard constraints (data, security, performance, deadlines), and how success will be judged. Keep batching until the scope is clear. Then play it back as a short outline (problem, users, feature areas, non-goals) and get the human's confirmation or corrections before going deeper.

### Step 3 — Detail each feature area

Take the confirmed areas one at a time, and for each ask batches of three to five questions until its requirements are complete: the main flow and the alternatives, inputs and outputs, rules and limits, error and empty states, permissions, data it keeps, how it interacts with other areas, and what "done" looks like. Keep adding batches while answers open new questions; an area is finished when each of its requirements can be stated so a test could check it. Say which area you are on and how many remain. If the human says to use your judgment, proceed on stated assumptions and list them.

### Step 4 — Write the PRD

Fill `reference/template.md` into `{paths.product}/{short-name}.md` (default `knowledge/product/`). Number every requirement, make it testable, and mark a priority. Put every unresolved item in Open questions with who decides. For a very large product, write the overall doc first and one doc per feature area beside it, linked from the overview.

### Step 5 — Review and hand off

Present the PRD and apply the human's changes. Commit it normally; it is a living document and needs no approval commit. Then recommend the next step: `skill/feature-planning`<!-- skill-ref: ignore --> for large work, or implementation directly for small work, per `skill/oversight`<!-- skill-ref: ignore -->.

## Outputs

- `{paths.product}/{short-name}.md`, plus the list of assumptions made on the human's behalf

## Edge Cases

- **A PRD for this idea already exists** — update it instead of writing a second one
- **The human wants to skip the interview** — write from what they gave you, mark every inferred requirement as an assumption, and keep Open questions honest
- **The human wants to stop partway** — write what is settled, mark the unfinished areas as open, and say which remain
- **Requirements conflict with the architecture docs or standards** — raise it; do not quietly resolve it
