---
name: 'oversight'
version: '1.0.1'
description: 'Decides how much human sign-off a piece of work needs (none, by-size, or always) and what each level gates, so small work runs unattended and large work stops at a plan and milestones.'
---

## Purpose

Scales process to the work. Small, clear changes run start to finish with a summary at the end; large or risky work stops for a plan and milestone checkpoints. The human sets the level in their prompt, the project sets a default (and may enforce a floor) in `.aiconfig.json`.

## Inputs

- **The human's request** — including any wording that sets a level: "just do it" or "no check-ins" → `none`; "plan this first" or "check with me" → `always`; "use your judgement" → `by-size`
- **Project setting** — `oversight.default` and `oversight.enforced` in `.aiconfig.json`, resolved by `scripts/resolve.js`

## Steps

### Step 1 — Resolve the level

Run `node scripts/resolve.js` from this skill's directory (the harness gives its path) with the project root as the working directory, adding `--request <level>` when the human's wording asks for one. It reads `oversight` from `.aiconfig.json` and prints the effective level. When it reports that a request was ignored because oversight is enforced, tell the human and continue at the enforced level. If it cannot run, use `by-size`.

### Step 2 — Size the work (only for `by-size`)

**Small** — reviewable in one pass: a few files, clear intent, no new dependency, pattern, or schema, easy to revert, nothing security-, data-, or API-sensitive.

**Large** — anything else: cross-cutting changes, new dependencies or conventions, schema/API/data-model changes, security-sensitive code, ambiguous requirements, or more than one review pass of work. When unsure, treat it as large.

State the size and a one-line reason.

### Step 3 — Apply the gates

| Level     | Work size | Plan approval                                | Milestone checkpoints |
| --------- | --------- | -------------------------------------------- | --------------------- |
| `none`    | any       | No                                           | No                    |
| `by-size` | small     | No                                           | No                    |
| `by-size` | large     | Yes                                          | Yes                   |
| `always`  | any       | Yes — a short outline in chat for small work | Yes                   |

- **Plan approval:** present the plan and stop until the human explicitly approves. Large work also needs the plan committed and approved per `steering/engineering/git-workflow.md`: "Large Work Gets a Committed, Approved Plan First"
- **Milestone checkpoints:** the plan names the milestones; after each, report what changed and what is next, then stop for a go-ahead. Small work under `always` has one checkpoint, after implementation and before review
- **Stopping:** use `ask_user` or `plan` if you hold them, otherwise end your turn with the state and the question

### Step 4 — Finish

At every level, run the independent review before reporting done, and end with a short summary: what changed, how it was verified, review outcome, and anything left for the human.

## Outputs

- The effective level and, for `by-size`, the size and why
- Stops only where Step 3 requires them
- A final summary

## Edge Cases

- **Work grows mid-flight** — if small work turns out to be large, stop and re-apply Step 3 from the plan stage, unless the level is `none`
- **Level `none` still stops** for things that need a human regardless: an unresolved ambiguity that changes the outcome, a decision outside the standards (a new dependency or architecture choice), or any irreversible or destructive action
- **The human changes the level mid-task** — re-run Step 1 with the new request; enforcement still applies
