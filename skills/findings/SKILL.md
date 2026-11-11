---
name: 'findings'
version: '1.1.1'
description: 'Records review and scan findings that should not block a PR as labelled GitHub issues, and shows which open findings touch the files you are about to change so they can be folded into the work.'
---

## Purpose

Findings below the blocking line (LOW from review, anything a scan reports that is not worth a round) must not be lost or re-raised every review. Each is a GitHub issue labelled `finding`. Nothing is stored in the repo, so nothing conflicts or goes stale.

## Inputs

- **Paths** — files the work will touch (before implementing) or that a finding affects (when filing)
- **A batch request** — the human asks to work down findings; optional `--max`, `--max-simple`, `--include-large`
- **A finding** — title, severity, source, rule violated, affected files, optional effort and detail

## Steps

### Step 1 — Look up before implementing

Run `node scripts/findings.js <path> …` from this skill's directory with the repo as the working directory. It prints one line per open finding touching those paths: `#n severity files rule (effort)`. Fold the cheap ones into the work and put `Fixes #n` in the commit or PR; leave the rest. With no paths it lists every open finding. A `stale:` line means a listed file no longer exists: close the issue or fix its `files:` line.

### Step 2 — File what you will not fix now

For each reported finding below the blocking line, and for each scan result worth keeping, run:

`node scripts/findings.js file --title "<short title>" --severity <critical|high|medium|low> --source <review|scan name> --rule "<rule violated>" --files a,b [--effort <S|M|L>] [--detail "<why and fix hint>"]`

It comments on an open finding that shares a file and a rule, otherwise opens a new issue labelled `finding`, `severity:<level>` and `source:<source>`. When it reports new files on an existing finding, add them to that issue's `files:` line.

### Step 3 — Create missing labels (once per repo)

If filing fails because a label is missing, create `finding`, `severity:*` and `source:*` with `ai-git gh-api repos/{owner}/{repo}/labels --method POST -f name=… -f color=…`.

### Step 4 — Burn down a batch

When the human asks to work down findings, run `node scripts/findings.js batch [--max N] [--max-simple N] [--include-large]` from this skill's directory with the repo as the working directory. `--max` (default 5) caps the main group of M findings or smaller, `--max-simple` (default 15) caps the extra S findings in the same areas, and `--include-large` makes L findings eligible. It prints one line per finding, a blank line between findings that share a file, and a final `Fixes #a, Fixes #b` line.

Implement the batch under the active standards and put every `Fixes #n` in the PR. For a finding that proves wrong or not worth fixing, comment on the issue with why, leave it open for triage, leave its `Fixes #n` out, and list it in the PR as `Reviewed #n` so it is recorded without being closed. Then the normal flow applies: oversight sizing, tests, independent review, PR.

## Outputs

- Step 1: the matching findings, one line each
- Step 2: the issue number commented on or opened
- Step 4: the batch lines, the `Fixes #n` line, and a `Reviewed #n` line for each finding commented on and left open

## Edge Cases

- **`ai-git gh-api` unavailable or unauthenticated** — report the finding in the PR description instead; never drop it
- **No open findings** — Step 4 prints nothing and exits 0; report that there is nothing to burn down
- **More than 100 open findings** — the script pages through them; pass paths to keep the output short
- **Finding spans many files** — list them all in `--files`; the issue appears under each path
- **Just filed, not listed yet** — GitHub's issue list lags creation by a few seconds, so filing the same finding twice in quick succession can open a duplicate; file once per finding per pass
- **Same finding, different wording** — match on the rule, not the title
