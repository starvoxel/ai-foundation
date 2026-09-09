# YouTrack Integration Plan

> Status: Draft
> Created: 2026-09-09
> Approved by: Pending

A tracking-layer integration on top of the Feature/Task model defined in
`docs/process-model.md`. Split out from that document because it is a layer on
top of the core process simplification, not part of the core itself — the core
(coarser work units, one-agent-owns-a-Task, the four-home decision model)
stands on its own without this landing.

---

## Goal

Give Feature/Task status, activity history, and escalations a surface a human
can see at a glance, without YouTrack becoming a second source of truth for
anything that already lives in git.

---

## Scope

- **Owns:** Feature/Task status, activity log (replaces the hand-authored
  orchestration log), hierarchy, dependency links for the board, PR links,
  escalations, dashboards and reports.
- **Does not own:** `tasks.json`, reference-doc bodies, ADR bodies, the nav
  index — all stay in git. A generated one-way Article mirrors the repo nav
  index for in-tracker navigation.

---

## Design

- Self-approval prevention: a YouTrack workflow rule if the free tier supports
  it, else a CI check that rejects an `Approved` flip authored by the AI
  identity.
- Prerequisite: verify free-tier custom fields + JS workflow rules on a
  throwaway instance before migrating.

---

## Sequencing

1. Verify free-tier capability (custom fields, JS workflow rules) on a
   throwaway instance.
2. Migrate Feature/Task tracking once `docs/process-model.md`'s core
   (reference-doc structure, Feature/Task rename, agent roster) has landed —
   this layer assumes that model already exists; it does not gate it.
3. Grandfather `AIF-001/002/003` — no retroactive migration of already-Done
   work.

This is independent, follow-on work. Nothing in `docs/process-model.md`
depends on this document landing.
