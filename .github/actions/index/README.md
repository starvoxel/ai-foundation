# `index` action

Runs `aif index architecture` in the calling repository: validates its arc42 docs (`check`) or writes `index.json` (`generate`).

## Inputs

| Input  | Default | Meaning                                                                                                             |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `mode` | `check` | `check` runs `aif index architecture --check` and fails on stale docs or broken links. `generate` writes the index. |

## Caller prerequisites

The action does not set up Node or check out your repo. Before it, your job must:

1. Check out the repo with full history: `actions/checkout` with `fetch-depth: 0` (staleness is computed from git history).
2. Install Node 22.23.4 or newer: `actions/setup-node`.

## Usage

```yaml
steps:
  - uses: actions/checkout@<sha> # vX.Y.Z
    with:
      fetch-depth: 0
  - uses: actions/setup-node@<sha> # vX.Y.Z
    with:
      node-version: 22.23.4
  - uses: starvoxel/ai-foundation/.github/actions/index@<sha> # vX.Y.Z
```

Pin by full commit SHA with the release version in a comment so Dependabot's `github-actions` ecosystem can bump it. Every step uses `shell: bash`, so it runs on Windows runners (Git Bash). The action holds no secrets and uses no network beyond `npm ci --omit=dev` for AIF's own dependencies. See `docs/architecture/05_07_ci_actions_and_release.md`.
