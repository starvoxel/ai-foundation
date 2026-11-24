# Plan: AIF project integrations

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-24 |

## Goal

Every project that uses ai-foundation wants the same integrations: the index and bundle-drift checks in CI, a daily bundle-update PR, a Dependabot group for AIF, the git hooks and the session-start script. Folio set these up by hand, copying about 80 lines of workflow. Make them a release of AIF that a project adopts with one command and keeps current with Dependabot.

## Scope

- In: a reusable update workflow and a combined `checks` action; a scaffold command that writes the project-side files; a verify command; the shared setup conventions (names, org-level settings), documented.
- Out: moving Folio onto the new pieces (a follow-up PR in Folio), npm publishing, a GitHub App for the update token, changing `isCurrent()`.

## Approach

- **Shared logic lives in AIF.** `.github/workflows/update-bundles.yml` (`workflow_call`) holds what Folio's `aif-update.yml` does today: the bundles action in `update` mode, the Bitwarden token fetch, replacing the single update PR. `.github/actions/checks` runs the `index` and `bundles` (`check`) actions in one step. Both ship in the existing release flow ([05.07](../architecture/05_07_ci_actions_and_release.md)), so consumers get changes through Dependabot.
- **Project-side files are thin.** What cannot be shared is written by the scaffold: a caller for the update workflow, a standalone checks workflow, the Dependabot `aif` group, `.githooks/`, `scripts/session-start.sh`, and the SessionStart entry in `.claude/settings.json`. It extends `aif init` and `projects/_template/`, which already carry the hooks and session script.
- **Idempotent and non-destructive.** Re-running skips files that already match, never overwrites a changed file without `--force`, and prints one line per file (written, current, skipped). An existing `dependabot.yml` or `ci.yml` is never rewritten; the command prints the snippet to add.
- **Kept current.** The files with no pinned `uses:` (hooks, session script) are recorded in the project manifest with hashes so `aif install --update` and `--check` keep them current. Pinned `uses:` lines are left to Dependabot.
- **Verified.** A pure check function takes the file tree and reports what is missing or out of date; a thin command wraps it. CI runs it through the `checks` action.

## Milestones

### 1. Reusable workflow and `checks` action

- Does: `update-bundles.yml` and `actions/checks`, with READMEs and consumer usage added to arc42 §5.07. Release via the existing version bump.
- Acceptance criteria: a consumer replaces its 77-line update workflow with a caller of under 20 lines and gets the same behaviour; one `uses:` line runs both checks; every `run:` step sets `shell: bash`; the workflow's permissions are the least that work.
- Verified by: the validation test for action files extended to `checks` and the workflow; a manual run from a consumer branch (Folio) on both Linux and Windows runners.

### 2. Scaffold command

- Does: the scaffold (command name in Open questions) with the behaviour above, plus manifest tracking of the non-pinned files.
- Acceptance criteria: on an empty repo it writes every file and a second run changes nothing; on a repo that already has some of the files it only reports; a user-edited file is never overwritten without `--force`; an existing `dependabot.yml` is left alone and the snippet is printed.
- Verified by: unit tests of the pure planning function (given a file tree, returns writes and skips); integration tests on temporary directories for empty, partial, edited and fully set up repos.

### 3. Verify command and conventions

- Does: the verify command and its use in the `checks` action; a doc of the fixed names (`BWS_ACCESS_TOKEN`, `AIF_UPDATE_TOKEN_SECRET_ID`, `BWS_CLOUD_REGION`) and the org-level setup.
- Acceptance criteria: reports each missing or stale piece with the fix; fails only on a missing required piece and warns on drift; `uses:` lines not pinned to a SHA with a version comment are reported.
- Verified by: unit tests of the pure check over fixture trees; the command run against Folio and a fresh scaffold.

## Requirements

- Security: the reusable workflow runs with the least `permissions` and no third-party action beyond ones pinned by full SHA with a version comment; the Bitwarden token is fetched after any `npm ci` and never echoed; generated files contain no secrets or tokens; checkouts set `persist-credentials: false`; the scaffold writes only inside the project root and rejects paths that escape it.
- Logging: the scaffold and verify commands print one line per file or finding, and the actions echo the `aif` command they run, as the existing actions do.

## Open questions

- Command name: `aif init --integrations` (extends `init`, which is for new projects) or a new `aif setup`. Human decides.
- Can the project manifest track non-bundle files, or does that need a manifest change? Check at the start of milestone 2.
- Does a called workflow see the caller's repository variables (for `AIF_UPDATE_TOKEN_SECRET_ID`), and does it need `secrets: inherit` or an explicit secret? Check at the start of milestone 1; if not, the caller passes them as inputs.
- A GitHub App token instead of a personal token for the update PR: out of scope here; decide separately.
