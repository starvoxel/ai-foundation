# AI Engineering Plan: Tech-Lead Approval-Gated Subagent Dispatch for AI-Track Plan Authorship

> Status: Deferred
> Created: 2026-08-13
> Approved by: Pending

**Deferral note (2026-08-13):** Superseded by a reconsideration of AIF-005's chosen Option (dual-authorship). Human indicated preference for reopening AIF-005 toward something closer to its Option A (single Chunk Plan authorship regardless of track), with Tech-Lead able to both author and dispatch. Routed to Architect to formally reconsider AIF-005/AIF-010 before any agent/skill changes proceed. See follow-up conversation.

---

## Goal

Give Tech-Lead the ability to dispatch AI-Engineer as a subagent — gated behind human approval on every use — to author the detailed plan for AI-track chunks immediately after chunk decomposition. This closes the gap where AI-track chunks (per AIF-005/ AIF-010) need an `Approved` plan (or a documented Tier-1/2 no-plan determination)
before Engineering-Manager's orchestration can dispatch them for implementation, but nothing currently triggers that plan-authorship step. Confirmed with the human: "Before EM starts orchestrating, we need proper plans. Either Tech Lead makes them, or Tech Lead asks someone else to." AI-Engineer remains the author (per AIF-010, Tech-Lead does not write AGENTS.md-schema-level detail) — Tech-Lead only triggers the dispatch.

---

## Components Affected

| Component | Action | Notes |
|---|---|---|
| `agents/tech-lead.yaml` | Modify | Add `subagent` tool (not in `approved_tools` — every dispatch requires human confirmation at runtime). Add a process step, a responsibility, and hard rules governing when/how it dispatches AI-Engineer. Minor version bump (0.5.0 → 0.6.0). |

No other component changes. This plan does not touch `skill/chunk-orchestration`, `skill/chunk-planning`, or `skill/epic-planning` — those are AIF-001's scope (track-aware dispatch/pipeline documentation), already decomposed and separately gated. AI-Engineer's own plan-authorship mechanics (`skill/complexity-tiers`, `skill/ai-engineering-plan`, `skill/plan-lifecycle`) are unchanged; Tech-Lead invokes them by dispatching AI-Engineer, it does not reimplement them.

---

## Approach

1. **Add `subagent` to `tools`, not to `approved_tools`.** Matches the existing `tools`/`approved_tools` convention (`skill/agent-authoring` Step 4): the tool is available but every use requires human confirmation at runtime. This is the mechanical meaning of "needs approval" the human confirmed.

2. **Add a Process step** (after chunk decomposition, before Engineering-Manager handoff): for each chunk in `chunks.json` whose `agents` field is `["AI-Engineer"]`, Tech-Lead dispatches an AI-Engineer subagent instructed to:
   - Read the chunk's scope summary from the Epic's Section 8
   - Use `skill/complexity-tiers` to determine Tier 1/2/3
   - Tier 1/2: proceed without a written plan (per that skill's process)
   - Tier 3: produce a plan via `skill/ai-engineering-plan`, gated by `skill/plan-lifecycle` (Draft → human review → committed `Approved`/`Deferred`)
   Each dispatch is a separate subagent invocation requiring separate human confirmation (no batch-approval of multiple dispatches at once).

3. **Add a Responsibility line**: "Trigger AI-track chunk-plan authorship by dispatching AI-Engineer as a subagent, once per AI-track chunk, gated by human approval at dispatch time."

4. **Add Hard Rules:**
   - Never dispatch a subagent without explicit human confirmation at the point of dispatch (the tool is intentionally excluded from `approved_tools`).
   - Only dispatch AI-Engineer for AI-track **plan authorship** — never for implementation. Implementation dispatch remains Engineering-Manager's responsibility via `skill/chunk-orchestration`, unchanged by this plan.
   - Never dispatch before `chunks.json` has passed `dag-validate`.
   - Do not consider an Epic ready for Engineering-Manager orchestration handoff until every AI-track chunk has either a committed `Approved` plan or a documented Tier-1/2 "no written plan needed" determination recorded in the Epic's Work Log.

5. **Bump `agents/tech-lead.yaml` version** 0.5.0 → 0.6.0 (new capability, backward compatible — no existing field removed or redefined).

---

## Open Questions

None. Scope, mechanism, and approval semantics were confirmed directly by the human in conversation before this plan was drafted.

---

## Risks

- **Overlap with Engineering-Manager's dispatch role**: mitigated by scoping Tech-Lead's dispatch strictly to plan authorship (pre-orchestration), never implementation — the two dispatch points serve different purposes and never compete for the same chunk at the same time.
- **This plan is adjacent to two Approved Decision Records (AIF-005, AIF-010)** but does not contradict either: AIF-010 only settled *who decides chunk boundaries* (Tech-Lead, unchanged here); AIF-005 settled *who authors AI-track plans* (AI-Engineer, unchanged here) and *how Engineering-Manager dispatches for implementation* (unchanged here). This plan only adds a missing trigger for a step both decisions already assumed would happen, without specifying by whom. No existing Decision Record is superseded or contradicted.

---

## Validation

- Run `npm test` (validation suite) to confirm `agents/tech-lead.yaml` still passes schema validation (`approved_tools` ⊆ `tools`, valid semver, etc.)
- Manually verify `subagent` is present in `tools` and absent from `approved_tools`
- Confirm no other agent/skill file references `tech-lead.yaml`'s tool list in a way that would be invalidated by this addition

---

## Out of Scope

- Any change to `skill/chunk-orchestration`, `skill/chunk-planning`, or `skill/epic-planning` (AIF-001's scope, unaffected by this plan).
- Introducing a new agent or skill.
- Changing how Engineering-Manager dispatches for implementation.
- Retroactively applying this to any Epic already in orchestration.
