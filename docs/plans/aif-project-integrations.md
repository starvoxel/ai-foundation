# Plan: AIF project integrations

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-24 |

## Goal

Every project that uses ai-foundation wants the same integrations: the index and bundle-drift checks in CI, a daily bundle-update PR, a Dependabot group for AIF, the git hooks and the session-start script. Folio set these up by hand, copying about 80 lines of workflow. Make them a release of AIF that a project adopts with `aif install` (and `aif init`) and keeps current with Dependabot and the daily update.

## Scope

- In: a reusable update workflow and a combined `checks` action; making project scope the default for `aif install`; an `--integration` flag on `aif install` that installs the project-side files; extra drift checks; the shared setup conventions (names, org-level settings), documented.
- Out: moving Folio onto the new pieces (a follow-up PR in Folio), npm publishing, a GitHub App for the update token, changing `isCurrent()`.

## Decisions

- **Flag:** `-I, --integration <name>[,...]` on `aif install`, parallel to `-B/--bundle`. Integrations are not bundles.
- **Project scope only.** `-I` implies project scope; `-I` with an explicit `--scope global` is an error. No `--harness` is needed.
- **Default scope becomes `project`** for `install`, `uninstall`, `status` and `--update`/`--check`. Global stays available with an explicit `--scope global`.
- **Manifest:** integrations are recorded in their own `integrations` section, so `status` and `uninstall` tell them apart from bundles.
- **Reusable workflow inputs:** the caller passes the Bitwarden secret ID as an explicit input and the access token as an explicit secret, so the design does not depend on whether a called workflow sees the caller's variables.
- **Version:** the default-scope change is a minor bump (0.x) with a release note. 1.0.0 waits until a project is fully set up on AIF.
- **Update token:** a Bitwarden-held token as today. A GitHub App is a separate decision; the single named secret means switching later changes no caller.

## Approach

- **Shared logic lives in AIF.** `.github/workflows/update-bundles.yml` (`workflow_call`) holds what Folio's `aif-update.yml` does today: the bundles action in `update` mode, the Bitwarden token fetch, replacing the single update PR. `.github/actions/checks` runs the `index` and `bundles` (`check`) actions in one step. Both ship in the existing release flow ([05.07](../architecture/05_07_ci_actions_and_release.md)), so consumers get changes through Dependabot.
- **Default scope.** `DEFAULT_SCOPE` in `lib/scope.js` becomes `project`. Project scope needs a project root, so a project-scope command run where there is none (no `.aiconfig.json` and no git root) fails with a message naming `--scope global`. Every place that relies on the old default (the cloud setup steps, `session-start.sh` in the template, READMEs, tests) is updated in the same milestone. This is a breaking change and ships as a minor version bump with a release note.
- **Integrations.** Each integration is a small set of project files owned wholesale by AIF: a standalone checks workflow, the update caller, `.githooks/`, `scripts/session-start.sh`. They are recorded with hashes so `aif install --update` and `--check` keep them current; the `bundles` action's `changed` output widens to their paths. Pinned `uses:` lines are left to Dependabot. Files shared with the project (`dependabot.yml`, `ci.yml`, `.claude/settings.json`) are never rewritten: the command prints the snippet to add. A user-edited file is not overwritten without `--force`.
- **Verified.** A pure function takes the file tree and reports what is missing or out of date; `--check` wraps it and adds: `uses:` lines not pinned to a SHA with a version comment, a missing Dependabot `aif` group, and missing workflow inputs.

## Milestones

### 1. Reusable workflow and `checks` action

- Does: `update-bundles.yml` and `actions/checks`, with READMEs and consumer usage added to arc42 §5.07. Release via the existing version bump.
- Acceptance criteria: a consumer replaces its 77-line update workflow with a caller of under 20 lines and gets the same behaviour; one `uses:` line runs both checks; every `run:` step sets `shell: bash`; the workflow's permissions are the least that work.
- Verified by: the validation test for action files extended to `checks` and the workflow; a manual run from a consumer branch (Folio) on Linux and Windows runners.

### 2. Project scope becomes the default

- Does: the default change, the no-project-root guard, and the updates to everything that relied on the old default.
- Acceptance criteria: `aif install -B <bundle> -H <harness>` in a project writes project scope; `--scope global` behaves exactly as the old default did; outside a project the project-scope commands fail with the message above; `status`, `uninstall`, `--update` and `--check` follow the new default; no document or script still describes global as the default.
- Verified by: updated unit and integration tests (`scope`, `install-project-scope`, `init`, `cloud-setup-steps`); a search of the repo for leftover default-scope wording.

### 3. Installable project integrations

- Does: `-I/--integration` on `aif install`, the integration definitions, the `integrations` manifest section, tracking in `--update` and `--check`, and the call from `aif init`.
- Acceptance criteria: on an empty repo `aif install -I <names>` writes every file and a second run changes nothing; on a partly set up repo it only reports; a user-edited file is never overwritten without `--force`; an existing `dependabot.yml` is left alone and the snippet is printed; `-I` with `--scope global` is an error; `aif init` installs the default integrations.
- Verified by: unit tests of the pure planning function (given a file tree, returns writes and skips); integration tests on temporary directories for empty, partial, edited and fully set up repos.

### 4. Extra checks and conventions

- Does: the drift checks above inside `--check`, their use through the `checks` action, and a doc of the fixed names (`BWS_ACCESS_TOKEN`, `AIF_UPDATE_TOKEN_SECRET_ID`, `BWS_CLOUD_REGION`) and the org-level setup.
- Acceptance criteria: each missing or stale piece is reported with its fix; a missing required piece fails and drift warns; `uses:` lines not pinned to a SHA with a version comment are reported.
- Verified by: unit tests of the pure check over fixture trees; the check run against Folio and against a fresh install.

## Requirements

- Security: the reusable workflow runs with the least `permissions` and no third-party action beyond ones pinned by full SHA with a version comment; the Bitwarden token is fetched after any `npm ci` and never echoed; generated files contain no secrets or tokens; checkouts set `persist-credentials: false`; integration installs write only inside the project root and reject paths that escape it.
- Logging: install and check print one line per file or finding, and the actions echo the `aif` command they run, as the existing actions do.

## Open questions

- Names of the default integrations (`checks`, `update`, `hooks`, `session-start`, `all`): the human decides at the start of milestone 3.
