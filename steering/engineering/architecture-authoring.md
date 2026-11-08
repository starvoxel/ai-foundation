---
name: 'architecture-authoring'
version: '0.5.1'
description: 'Defines how arc42 documentation stays current: staleness is computed from git, and a change that leaves a doc accurate is waived in its commit message.'
file_patterns: []
---

## Scope

All agents with `domain = "engineering"`, in any project. The schema and `key_files` rules for the docs themselves are in `steering/engineering/architecture-docs.md`, loaded when working on architecture files.

---

## Rules

### Rule: Staleness Is Computed From Git, Not Stored

A doc is stale when a `key_files` entry changed in a non-merge commit that no commit editing the doc has in its history (or no longer exists), unless that commit waives it. Merge commits never count, so merging main into a branch cannot make a doc stale by itself. Nothing is recorded in the doc, so parallel branches never conflict on a verification stamp.

- When a change affects what the doc says, update the doc in the same PR
- When a change to a `key_files` entry leaves the doc accurate (a refactor, simplification, or comment change), do not edit the doc. Add a line to that commit's message: `Arch-Unaffected: <section> — <why the doc is still accurate>`, using the section's frontmatter `section` value, e.g. `05.04`
- A waiver also covers every earlier unchecked commit on the branch, never later ones. A missed waiver is fixed with a new commit (`git commit --allow-empty`) carrying the line, never by rewriting a pushed commit
- The repo's `commit-msg` hook warns when a commit touches a `key_files` entry with neither the doc nor a waiver, so add the line at commit time
- Never waive or touch a doc without re-reading it against the changed file; the reviewer checks that each waiver's reason is true
- Run `aif index architecture --check` as the last local step before pushing. The generated `index.json` is gitignored and never committed

**Rationale:** A stored SHA was bumped by every branch on every doc, producing constant merge conflicts. Deriving staleness from history removes the shared state and keeps the check honest.

**Exceptions:** None.

---

## Enforcement

A doc edited, or a waiver added, without re-reading it against the changed file — or a waiver whose reason is untrue — is a MEDIUM finding at review.
