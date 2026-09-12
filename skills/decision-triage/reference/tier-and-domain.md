# Tier and Domain Reference

> **Source of truth: AIF-META-001.** This file is a fast-reference copy of AIF-META-001's Design section (Tier definitions, promotion threshold, Domain ownership table), reproduced here so `decision-triage` doesn't require re-reading the full options-exploration record on every invocation. If this file and AIF-META-001 ever disagree, **AIF-META-001 governs** — file an update here to resync.

---

## Tier definitions (rigor axis, independent of domain)

| Tier               | Format                                                                                                                                                                                                                                                                                                                                                                        | Gate                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Researched** | Full options-exploration skeleton: Metadata, Problem Statement, Constraints, Options Explored (2-4 genuinely distinct options with strengths/weaknesses/verdict), Decision, optional Design, Impact on Planning, Resolved/Open Items. `Design` and `Impact on Planning` content is shaped by domain-specific guidance (see Domain table below) rather than a forked template. | Full `plan-lifecycle` cycle: Draft → any number of revision commits → Approved (or Deferred), each its own commit.                                                          |
| **B — Structural** | Slim skeleton: Metadata (including Tier/Domain), Problem, Decision, Rationale, Impact. No Options-Explored ceremony.                                                                                                                                                                                                                                                          | Lighter one-shot confirmation — Draft committed, human confirms, Approved committed. No expectation of a multi-round revision cycle, though one may still happen if needed. |
| **C — Embedded**   | No standalone artifact. Recorded inline in the governing plan's own body or its sibling worklog file, using a short "Decision: ... **Why:** ..." convention.                                                                                                                                                                                                                  | Rides the governing plan's own `plan-lifecycle` gate. Nothing separate.                                                                                                     |

## Promotion threshold

Tier C is the default for any decision made during planning or implementation:

1. Genuine trade-off between 2+ viable approaches with lasting cross-component impact → **Tier A**.
2. Else, can you name a plausible second, currently-unwritten piece of work that will need to cite this decision independently of the plan that made it? → **Tier B**.
3. Else → **Tier C**.
4. **Retroactive promotion**: if a Tier C decision is later cited by a second, unrelated plan, promote it — move its content into a proper Tier B (or A, if warranted) entry, assign it an ID, add it to the index — rather than letting the second plan re-explain it inline.

## Domain ownership (subject-matter axis, independent of tier)

| Domain                                                    | Code   | Owner                                                                                                   | Template guidance for Design/Impact on Planning                    | `knowledge/index.json`?                                                                                     |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Architecture                                              | `ARCH` | Architect                                                                                               | Schemas, component boundaries, system-structure diagrams           | Yes — scope `all` or close to it                                                                            |
| Process/orchestration                                     | `PROC` | Engineering-Manager _(charter expansion)_                                                               | Dispatch/pipeline flow changes, orchestration-state effects        | No — implemented effect lives in `chunk-orchestration`/`worktree-management`/git-workflow steering directly |
| Planning-artifact conventions                             | `PLAN` | Tech-Lead                                                                                               | Chunk/Epic Plan shape, worklog structure, plan-lifecycle mechanics | No — implemented effect lives in the relevant plan template                                                 |
| AI-component/declarative-system                           | `AIC`  | AI-Engineer _(existing precedent, AIF-PROC-001)_                                                        | Agent/skill/steering/schema impact                                 | Yes — scoped to AI-Engineer + adjacent authoring skills                                                     |
| Quality-gate/review-process                               | `QA`   | Principal-Engineer                                                                                      | Review-criteria and severity-gate changes                          | No — implemented effect lives in the review skill/template                                                  |
| Test-strategy                                             | `TEST` | Test-Engineer                                                                                           | Test-execution/coverage-strategy changes                           | No — implemented effect lives in the test-execution skill                                                   |
| _(none — intentional)_                                    | —      | Software-Engineer                                                                                       | —                                                                  | Tech-Lead's Epic/Chunk process already covers Software-Engineer's decision needs                            |
| Meta-process (decisions about the decision-system itself) | `META` | Generic/catch-all agent for now; "Project-Manager" is reserved as the name for a future dedicated agent | Effect on `skill/decision-record` and related skills/steering      | No                                                                                                          |

No domain owner is granted `WebSearch`/`WebFetch` solely to support decision-authoring.

---

<!-- Authored under AIF-002-001 -->
