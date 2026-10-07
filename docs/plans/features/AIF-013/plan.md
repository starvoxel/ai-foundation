# Feature Plan: PR-range arc42 staleness gate with commit-trailer waivers

## 1. Metadata

| Field               | Value                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| Feature ID          | AIF-013                                                                            |
| Project             | ai-foundation                                                                      |
| Status              | Draft                                                                              |
| Author (Agent)      | Engineering Manager                                                                |
| Reviewed By         | Pending                                                                            |
| Created             | 2026-10-06                                                                         |
| Last Updated        | 2026-10-06                                                                         |
| Standards           | `javascript`, `node` (per `.aiconfig.json`)                                        |
| Total Tasks         | Not yet decomposed (Draft)                                                         |
| Product Requirement | None. Human request 2026-10-06                                                     |
| Depends On          | None                                                                               |
| ADRs                | 0006 (plain JS + JSDoc) applies. New ADR for the mechanism is Task 001 (Architect) |

---

## 2. Goal

Stop parallel features from conflicting on two things: the committed `index.json` files (`docs/architecture/`, `docs/decisions/`) and the per-doc `last_verified: <sha>` frontmatter. Replace both with (1) on-demand, deterministic index generation (nothing generated is committed) and (2) a CI gate over the PR's own commit range: a changed `key_files` entry must be accompanied by a change to a doc listing it, or by an `Arch-Unaffected:` commit-trailer waiver. No stored state, so nothing on `main` to conflict on.

> Requirement traceability: N/A. Evidence: 79 commits touched the architecture index in ~5 weeks; history is full of "re-pin last_verified" commits.

---

## 3. Quick Summary

**Open Items:** 9 open (1 High / 3 Medium / 5 Low) — see Section 8

---

## 4. Scope

### In Scope

- Gitignore and stop committing `docs/architecture/index.json` and `docs/decisions/index.json`; `aif index <target>` generates them deterministically (no `generated_at`, no stored `stale`).
- `aif index <target> --check` keeps frontmatter validation, broken-relative-link detection, and decisions-index consistency; drops the diff against a stored file.
- Remove `last_verified` everywhere: all arc42 docs, `_template.md`, `REQUIRED_FIELDS`, parser, tests, and the `architecture-authoring.md` schema plus its "`--check` is a final validation" rule.
- PR-range gate in `lib/architecture.js` (pure/io split preserved), run in CI over `base..head`. Base = PR base; for `push-check/**`, base = `main`.
- `Arch-Unaffected: <section> — <reason>` commit-trailer waivers: parsing, validation, `aif index architecture --waivers [--section X] [--since <ref>]` report, CI job-summary listing.
- Principal-Engineer update (`skills/code-review/SKILL.md` checklist and severity, plus `agents/principal-engineer.yaml` only if its tools/prompt need it): validate waiver reasons on every review.
- Doc updates: steering (`architecture-authoring.md`, `knowledge-consumption.md`), `commit-gate-procedure.md`, `adr-authoring` skill index mentions, `AGENTS.md`/README, arc42 sections 02, 05_03, 05_04, 05_05, 05, 11 as they describe indexing/staleness.
- ADR for the mechanism (Architect).
- Migration note for in-flight features (Section 5).

### Out of Scope

- PR-body waiver support (only added if trailers demonstrably drop in squash merges — see Section 8, row 1).
- Any change to which files belong in `key_files`, beyond the hygiene needed to avoid gate false positives.
- Changing `aif index` semantics for downstream projects beyond what the ADR states (see Section 8, row 5).
- Re-installing `~/.claude/rules` (human action after merge; see Section 8, row 9).

---

## 5. Feature Description

### User-Facing Behaviour

- **Authors:** touching a file listed in any doc's `key_files` means updating that doc in the same PR, or adding a commit trailer `Arch-Unaffected: 05.04 — <why the doc is still accurate>`. No frontmatter bump, no index regeneration, nothing to rebase over.
- **Reviewers (Principal-Engineer):** the review process validates every waiver in the PR's range: the reason must genuinely explain why the named doc is unaffected by the change (not merely pass the mechanical check), and the named section must plausibly cover the changed file. A vacuous or misleading reason is a blocking finding (proposed MEDIUM; see Section 8, row 11). Principal-Engineer lists the range's waivers via `aif index architecture --waivers --since <base>`.
- **Anyone:** `aif index architecture --waivers [--section X] [--since <ref>]` lists historical waivers (date, commit, section, file, reason).
- **CI:** the job summary prints the range's waivers.

### Data Flow

1. CI resolves `base` (PR base SHA; `merge-base origin/main HEAD` for `push-check/**`) and `head`. Pushes to `main` skip the gate (already gated pre-merge).
2. io layer: `git diff --name-only base...head` → changed files; `git log base..head` → full messages.
3. Pure layer: parse each doc's `key_files`; parse waivers from messages; for every changed file listed in some doc, require (a) that doc in the changed set, or (b) a valid waiver naming a doc that lists the file. Output: violations, accepted waivers, rejected waivers (with reasons).
4. Existing check kept: a `key_files` entry missing from disk is stale unconditionally.

### Business Rules

- Waiver form: `Arch-Unaffected: <section> — <reason>`. Reason non-empty and meaningful (mechanical check; judgement is Principal-Engineer's). Section is a doc's frontmatter `section` value and must be a doc that lists a changed file; otherwise the waiver is rejected.
- A waiver in any commit of the range satisfies the gate for that section (source of truth is commits).
- Generated indexes are deterministic: same inputs → byte-identical output.
- Parser does not require strict trailer-block placement (see Section 8, row 1).

### Error States

| Scenario                                          | Expected Behaviour                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| Changed key_file, doc unchanged, no waiver        | `--check` fails, naming file and the doc(s) listing it                    |
| Waiver names a section that doesn't list the file | Rejected, reported; gate still fails for that file                        |
| Waiver with empty/placeholder reason              | Rejected, reported                                                        |
| key_file deleted from disk but still listed       | Stale unconditionally (unchanged behaviour)                               |
| Base ref unresolvable in CI (shallow, bad SHA)    | Fail closed with a clear message (checkout already uses `fetch-depth: 0`) |
| Malformed frontmatter / broken relative link      | `--check` fails (unchanged)                                               |

### Migration note for in-flight features (delivered with Task 006's PR)

After Task 006 lands on `main`, an in-flight branch rebases/merges `main` and then:

1. Resolve any `last_verified:` conflict by deleting the line (it no longer exists). Drop any commits whose only purpose was re-pinning it.
2. Resolve any `index.json` conflict by taking `main`'s state (file deleted; `git rm`). Never regenerate and commit it.
3. Run `aif index architecture --check` locally; if the gate reports a changed key_file, update the doc or add an `Arch-Unaffected:` trailer to a commit in the branch (new commit with trailer is fine; no history rewrite needed).

Ordering to minimize disruption: Task 006 (the only task that deletes `last_verified` from docs) is dispatched only after the gate (Task 004) is merged and green, and its PR is flagged to the human for a merge window when in-flight PR count is lowest.

---

## 6. Architecture Overview

### New Components

| Component                            | Type           | Responsibility                                                                                   |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------ |
| `lib/arch-waivers.js`                | Pure + thin io | Parse/validate `Arch-Unaffected` waivers from commit messages; `git log` wrapper for history     |
| PR-range gate (in `architecture.js`) | Pure + io      | Compute violations from changed files, key_files map, waivers; io wrapper resolves range via git |
| `--waivers` / `--base` CLI flags     | Command layer  | Report and gate entry points on `aif index architecture`                                         |
| CI step + job summary                | Workflow       | Run gate on PRs and `push-check/**`; print waivers                                               |

### Component Relationships

`lib/commands/index.js` → `architecture.js` (parse, reverse index, gate) → `arch-waivers.js` (waiver parse/validate). Git access only in io wrappers. `index-diff.js` is removed once no stored index is diffed (Task 002).

### Integration Points

- `lib/decisions.js` — loses stored-index diff; keeps parse/consistency checks.
- `.github/workflows/ci.yml` — Validate job: replace two index steps, add gate + summary. Docs-only detection untouched.
- `.github/scripts/check-version-bumps.mjs` — editing skills/steering in Tasks 007–008 triggers its version-bump requirement.

---

## 7. Security Considerations

- Commit messages are untrusted input in CI: waiver parsing uses `execFile` with argument arrays (no shell), refs passed via env vars (existing CI pattern), and job-summary output escapes markdown/HTML. Addressed in Tasks 003, 005.
- A waiver is an explicit bypass of a check, not of the required-status-check gate itself; it is visible in history and the job summary. This does not weaken `git-workflow-core.md`: "Required CI Checks Gate Main — Never Bypass Them" (the check still runs and is required).

---

## 8. Risks & Open Questions

| #   | Risk / Question                                                                                                                                                                                                                                 | Type     | Impact | Source  | Raised By | Resolved                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Squash merges may drop trailers from the final `main` commit (affects `--waivers` history only, not the gate).                                                                                                                                  | Risk     | M      | Request | Human     | Yes. Decision: repo setting is `squash_merge_commit_message: COMMIT_MESSAGES` (title `PR_TITLE`), so PR commit messages are carried into the squash body, but as mid-body bullet text, not a final trailer block. **Why:** strict `interpret-trailers` parsing would miss them, so the parser matches `^Arch-Unaffected:` lines anywhere in the message. No PR-body support. Task 003 tests a squash-shaped fixture; Task 005 confirms against the first real squash-merged history. |
| 2   | Waiver granularity: proposed that one waiver covers _all_ changed files that its named section lists (section-level, not per-file). Per-file would need a file in the trailer.                                                                  | Question | M      | Design  | EM        | No. Default if unanswered: section-level.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | "Meaningful reason" mechanical rule. Proposed: ≥ 10 non-space chars and not a placeholder (`n/a`, `none`, `ok`, `unaffected`, `-`). Everything else is Principal-Engineer judgement.                                                            | Question | L      | Design  | EM        | No. Default if unanswered: as proposed.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4   | Generated index placement: proposed `aif index <target>` still writes the (gitignored) `index.json` at its current path so existing readers keep working; deterministic, no `generated_at`; `--check` never reads it. Alternative: stdout only. | Question | M      | Design  | EM        | No. Default if unanswered: write gitignored file.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5   | `aif index` also runs in downstream projects, whose committed `index.json` files become obsolete. Should `aif init` add them to the project's `.gitignore`? Treated as out of scope unless you want it.                                         | Question | L      | Scope   | EM        | No. Default if unanswered: out of scope; ADR notes it.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | In-flight branches conflict when Task 006 lands (`last_verified` lines, `index.json`).                                                                                                                                                          | Risk     | H      | Request | Human     | No. Mitigation: Task 006 gated behind the live gate (004); migration note (Section 5) in 006's PR description; human picks the merge window.                                                                                                                                                                                                                                                                                                                                         |
| 7   | Window between Tasks 002–005 and 006: `last_verified` still exists, so those Tasks' own PRs still bump it.                                                                                                                                      | Risk     | L      | EM      | EM        | Yes. Decision: expected and accepted; old staleness check stays until 006 removes it atomically with the docs. **Why:** removing the check before docs/parser change together would break CI.                                                                                                                                                                                                                                                                                        |
| 8   | Task 001 dispatches Architect, which requires your explicit confirmation of that dispatch. The ADR needs an `Approved` commit before Task 007 cites it.                                                                                         | Question | L      | Process | EM        | No. Will ask at dispatch.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 9   | `~/.claude/rules` (`engineering-architecture-authoring.md`, `global-knowledge-consumption.md`) mirrors the old schema. Source of truth is this repo's steering; those copies stay stale until `aif install` is re-run after merge.              | Risk     | L      | Request | Human     | No. Human action after Task 007 merges; flagged again in the completion summary.                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11  | Severity of a vacuous/misleading waiver reason in review. Proposed MEDIUM (blocking per `skill/review-severity`), since it silently defeats the doc-currency gate.                                                                              | Question | L      | Design  | EM        | No. Default if unanswered: MEDIUM.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | Gate false positives: broadly-listed key_files (e.g. `lib/architecture.js` in several docs) force a doc edit or waiver on most PRs touching them.                                                                                               | Risk     | M      | EM      | EM        | No. Mitigation: Task 006 reviews `key_files` against the "key_files Scope" rule; waivers are the intended release valve. Scope kept to hygiene, not re-architecting docs.                                                                                                                                                                                                                                                                                                            |

---

## 9. Task Decomposition

Pending approval of this plan. Intended breakdown (to be written to [`tasks.json`](./tasks.json) after approval):

| ID  | Task                                                                                                                                        | Depends on    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 001 | ADR for the mechanism (Architect; gated dispatch; Draft → human Approved commit)                                                            | —             |
| 002 | On-demand deterministic index generation; gitignore + untrack both `index.json`; drop stored-diff; remove `index-diff.js`; CI step updates  | —             |
| 003 | `lib/arch-waivers.js`: parse/validate waivers, `git log` wrapper, unit tests incl. squash-shaped fixture                                    | —             |
| 004 | PR-range gate (pure + io), `--check` integration, CI base resolution; unit (synthetic diffs) + integration (temp git repo) tests            | 002, 003      |
| 005 | `--waivers [--section] [--since]` report + CI job summary                                                                                   | 004           |
| 006 | Remove `last_verified` (docs, `_template.md`, `REQUIRED_FIELDS`, parser, old staleness check, tests); key_files hygiene; migration note     | 004           |
| 007 | Steering/skills/README/AGENTS/arc42 prose updates, `process-model.md` supersession pointer to the ADR                                       | 001, 005, 006 |
| 008 | Principal-Engineer: validate waiver reasons in every review (`skills/code-review/SKILL.md` checklist + severity; agent yaml only if needed) | 005           |

Expected waves: W1 {001, 002, 003} · W2 {004} · W3 {005, 006, 008} · W4 {007}.

Parallelization notes:

- 002 and 004–006 all touch `lib/commands/index.js` and `lib/architecture.js`; the dependency chain serializes them. 005 and 006 overlap on those files in W3 (file-overlap warning only; expected small hunks).
- 006 and 007 both edit `docs/architecture/05_04`/`05_05` (frontmatter vs. prose); 007 depends on 006 so no overlap in practice.
- The Doc-Update Acceptance Gate applies to every Task (arc42 `key_files` additions for new `arch-waivers.js`, removals for deleted `index-diff.js`).

---

## 10. Acceptance Criteria

- [ ] All Tasks complete and signed off
- [ ] Feature works end-to-end as described in Section 5
- [ ] No CRITICAL, HIGH, or MEDIUM findings open in any Task review
- [ ] Neither `index.json` is tracked; two runs of `aif index <target>` produce identical output
- [ ] No `last_verified` remains in any doc, template, parser, test, or steering file
- [ ] A PR changing a listed key_file with no doc change and no waiver fails CI; the same PR with a valid trailer passes; a waiver naming a non-listing section is rejected
- [ ] Principal-Engineer review process checks waiver reasons (real explanation, section plausibly covers the file) and classifies a bad one as a blocking finding
- [ ] `--waivers` lists waivers with date, commit, section, file, reason; CI job summary prints the range's waivers
- [ ] Squash-merge trailer outcome recorded (Section 8, row 1) and confirmed against a real squash
- [ ] ADR Approved and committed; migration note present in Task 006's PR; `~/.claude/rules` re-install flagged to the human
