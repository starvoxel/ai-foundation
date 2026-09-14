# Decision Record — Per-Domain Guidance

Guidance for the `Design` and `Impact on Planning` sections of a Tier A
Decision Record, by Domain. Loaded in `skill/decision-record` Step 1 once the
Domain has been determined. Derived from AIF-META-001's Domain ownership table
— see that record for the authoritative source if this stub and AIF-META-001
ever appear to disagree.

| Domain       | Domain Code | Folder          | Default Owner                                                                          |
| ------------ | ----------- | --------------- | -------------------------------------------------------------------------------------- |
| Architecture | `ARCH`      | `architecture/` | Architect                                                                              |
| Process      | `PROC`      | `process/`      | Engineering-Manager                                                                    |
| Planning     | `PLAN`      | `planning/`     | Tech-Lead                                                                              |
| AI-component | `AIC`       | `ai-component/` | AI-Engineer                                                                            |
| Quality      | `QA`        | `quality/`      | Principal-Engineer                                                                     |
| Testing      | `TEST`      | `testing/`      | Test-Engineer                                                                          |
| Meta-process | `META`      | `meta-process/` | Generic/catch-all agent (name "Project-Manager" reserved for a future dedicated agent) |

## Architecture (`ARCH`)

**Design**: Schemas, component boundaries, system-structure diagrams — the
concrete shape of what's being built or changed.
**Impact on Planning**: What Tech-Lead must know when decomposing an Epic that
depends on this decision — components that will/won't exist, constraints on
file/module boundaries, options explicitly ruled out.

## Process (`PROC`)

**Design**: Dispatch/pipeline flow changes, orchestration-state effects —
sequence diagrams or state-transition tables for how work moves between agents.
**Impact on Planning**: Effects on chunk/wave sequencing, blocking/unblocking
mechanics, or agent dispatch order that Tech-Lead or Engineering-Manager must
account for in future Epic/Chunk decomposition.

## Planning (`PLAN`)

**Design**: Chunk/Epic Plan shape changes, worklog structure, plan-lifecycle
mechanics — template diffs or new required sections/fields.
**Impact on Planning**: How this changes what a Chunk Plan or Epic Plan must
contain going forward; whether existing plans need any retroactive note (they
are not rewritten, per Epic-level precedent, but the gap should be named).

## AI-component (`AIC`)

**Design**: Agent/skill/steering/schema impact — which declarative components
change shape, new fields, new cross-reference requirements.
**Impact on Planning**: What AI-Engineer (or Tech-Lead decomposing an Epic that
touches AI components) must know about new/changed schemas before authoring or
modifying agents, skills, or steering files.

## Quality (`QA`)

**Design**: Review-criteria and severity-gate changes — what moves a finding
from LOW to HIGH, what becomes a new blocking check.
**Impact on Planning**: Which existing review checklists (Principal-Engineer's)
change, and whether any currently-passing work would now fail review under the
new criteria.

## Testing (`TEST`)

**Design**: Test-execution/coverage-strategy changes — new required test
types, changed pass/fail criteria, new tooling in the test pipeline.
**Impact on Planning**: What Test-Engineer (or a Chunk Plan's Testing Plan
section) must include going forward as a result of this decision.

## Meta-process (`META`)

**Design**: Effect on `skill/decision-record` and related skills/steering
themselves — this is the domain for decisions _about_ the decision-system.
**Impact on Planning**: What every other domain's decision-authoring agent
must know changed about how decisions themselves are tiered, owned, stored, or
indexed — since a Meta-process decision can ripple into every other domain's
authoring workflow (as AIF-META-001 itself does).
