---
name: 'pr-authoring'
version: '1.0.0'
description: 'Writes a pull request title and description that follows the repo PR template exactly and tells a reviewer why the change exists, what it does, and how it was verified.'
---

## Purpose

Produces the PR text a human reviews. The repo's template decides the structure; this skill decides the content. Use it whenever a PR is opened or its scope changes. Driving the PR to green afterwards is `skill/pr-stewardship`<!-- skill-ref: ignore -->.

## Inputs

- **The change** — the commits and diff on the branch
- **Why it exists** — the request, PRD, or plan it implements
- **The repo's PR template**, if any: `.github/PULL_REQUEST_TEMPLATE.md`, or the files in `.github/PULL_REQUEST_TEMPLATE/`

## Steps

### Step 1 — Find the template

Look for the template files above. With a directory of templates, pick the one that fits the change. With none, use a plain Summary and Testing notes.

### Step 2 — Fill it exactly

Include every section the template defines, in its order, adding and removing none. Follow each section's instructional comment to the letter (length, content, format); a comment that asks for brevity means brief, and one that asks for detail means detailed. Do not average the guidance into one uniform style. Tick only checklist items that are true, and answer any disclosure section honestly. Delete the comment text itself once its section is filled.

### Step 3 — Write for the reviewer

- Lead with why the change exists, then what it does in terms of behavior, not a file-by-file list
- State how it was verified: the checks run and their results, and anything not verified
- Name risks, follow-ups, and decisions the reviewer should push back on
- Link the plan, PRD, or issue it implements
- Title in the imperative, under 70 characters
- Keep it as short as the change allows, per `steering/global/concision.md`<!-- skill-ref: ignore -->

### Step 4 — Open or update it

Create the PR with `ai-git` (in a cloud session through `ai-git gh-api`, per `skill/pr-stewardship`<!-- skill-ref: ignore -->). When later commits change what the PR does, update the description so it stays true.

## Outputs

- A PR title and description that match the template, ready to open or already updated

## Edge Cases

- **The template and the change disagree** (a section that cannot apply) — keep the section and say "Not applicable" with a reason, rather than deleting it
- **A very large change** — say so, and suggest how the reviewer should read it; consider whether it should be split
- **No template in the repo** — use the plain structure; do not invent sections
