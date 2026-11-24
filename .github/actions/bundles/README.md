# `bundles` action

Checks a project's committed AIF install for drift, or refreshes the bundles its manifest already records. There is no bundle list: only bundles recorded in the project manifest (`.claude/.installs.yaml`, `.kiro/.installs.yaml`) are touched, and new ones are never installed.

## Inputs and outputs

| Name      | Kind   | Default | Meaning                                                                                                                                                                                                                                                                                |
| --------- | ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`    | input  | `check` | `check` runs `aif install --scope project --check`: drift shows as a warning annotation and never fails the step. `update` runs `aif install --scope project --update`.                                                                                                                |
| `changed` | output | —       | `true` when `update` left uncommitted changes in the harness directories (`.claude/`, `.kiro/`), else `false` (always `false` for `check`). Taken from `git status --porcelain`, not from aif's "N updated" count, which reads "1 updated" at project scope even when nothing changed. |

## Caller prerequisites

The action does not set up Node or check out your repo. Before it, your job must run `actions/checkout` and `actions/setup-node` (22.23.4 or newer). `update` only modifies the working tree; committing and opening a PR from the `changed` output is the caller's job.

## Usage

```yaml
steps:
  - uses: actions/checkout@<sha> # vX.Y.Z
  - uses: actions/setup-node@<sha> # vX.Y.Z
    with:
      node-version: 22.23.4
  - id: bundles
    uses: starvoxel/ai-foundation/.github/actions/bundles@<sha> # vX.Y.Z
    with:
      mode: update
  - if: steps.bundles.outputs.changed == 'true'
    run: echo "harness files changed"
```

Pin by full commit SHA with the release version in a comment so Dependabot's `github-actions` ecosystem can bump it. Every step uses `shell: bash`, so it runs on Windows runners (Git Bash). The action holds no secrets and uses no network beyond `npm ci --omit=dev` for AIF's own dependencies. See `docs/architecture/05_07_ci_actions_and_release.md`.
