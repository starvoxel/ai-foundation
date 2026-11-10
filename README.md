# AI Foundation

A portable, harness-agnostic framework for AI-assisted software development.
Defines agent roles, reusable procedures, enforced rules, and coding standards as plain files that any AI harness can load.

Works with Kiro, Claude Code, or any tool that can inject text into an agent's context.

---

## Goal

Provide a single source of truth for AI-assisted development workflows that isn't locked to any vendor. Define once, install anywhere.

---

## Structure

```
ai-foundation/
├── agents/          Agent definitions (.yaml)
├── skills/          Reusable procedures (folders with SKILL.md)
├── steering/        Always-on rules (global/ + {domain}/)
├── standards/       Prescriptive coding/stack rules
├── servers/         MCP tool server definitions
├── bundles/         Install bundles (per-harness deployment)
├── projects/        Project template (scaffolded by `aif init`)
├── docs/            arc42 architecture docs and research briefs
├── bin/             CLI entry point (aif)
├── lib/             CLI modules
└── tests/           unit/, integration/, validation/
```

For details on component types, field requirements, and loading rules, see [`AGENTS.md`](AGENTS.md).

---

## Agents

| Agent                  | Role                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| engineer               | The main agent: requirements, planning, implementation, tests, docs, and PR — stopping for the human per the `oversight` setting |
| engineering-researcher | Web research — decision-ready briefs; the only agent with web access                                                             |
| reviewer               | Independent fresh-context review of a diff — correctness, security, standards                                                    |

---

## CLI

The `aif` CLI manages installation, validation, and project scaffolding.

```bash
# Install/manage bundles
aif install --bundle engineering --harness kiro
aif install --update
aif uninstall --bundle engineering --harness kiro
aif status

# Project scope: install into this project's .claude/ (or .kiro/), to commit
aif install --scope project -B engineering -H claude
aif install --scope project --update
aif install --scope project --check   # report drift in the committed install; never fails
aif status --scope project
aif list bundles|agents|skills|servers

# Validation
aif validate [schema|refs|bundles]

# Architecture indexing
aif index architecture          # generate docs/architecture/index.json
aif index architecture --check  # verify the architecture index without writing

# Project scaffolding
aif init --name my-app --shortname myapp --language csharp
aif init --name my-app --with-default-bundles   # also install the default bundles at project scope
aif init --cloud-steps                          # only print the steps to set up a Claude Code cloud environment
                                                # (a normal init prints them after scaffolding too)
aif init --interactive

# Config field resolution
aif config paths.research          # resolve a .aiconfig.json field, falling back to its default
aif config paths.research --abs    # print an absolute path (for paths.* keys)
```

### Harness Support

| Harness     | Status    |
| ----------- | --------- |
| Kiro        | Supported |
| Claude Code | Supported |
| Copilot     | Planned   |

Installs are copies (transformed per-harness), tracked by a manifest for clean uninstall and update detection. The manifest records a hash of each installed source, so `aif status` and `aif install --update` can tell what changed and reinstall only that.

#### Install scope

| Scope              | Writes to                                                                      | Manifest                                                     |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `global` (default) | `~/.claude/`, `~/.claude.json`; `~/.kiro/`                                     | `.installs.yaml` in the ai-foundation root, absolute paths   |
| `project`          | `<project>/.claude/`, `<project>/.mcp.json`; `<project>/.kiro/` (from the cwd) | `.claude/.installs.yaml` or `.kiro/.installs.yaml`, relative |

Commit a project-scope install. It is how a project's agents exist before a session starts, so `"agent"` in `.claude/settings.json` takes effect from the first turn, including in a fresh cloud session. Project scope always reinstalls (the output is committed, so adapter changes must reach it), and writes no machine-specific path. A stdio MCP server is committed without `node_modules` and installs its own dependencies on first start (`npm install --omit=dev --ignore-scripts`, so that start needs network and must finish within Claude Code's 30-second connect timeout, or the server is unavailable for that session); Kiro skips stdio servers. The committed `block-command` hook runs bare `node`, so `node` must be on the hook shell's PATH. Bundles with `default: true` in `bundle.yaml` (today `engineering`) are what `aif init --with-default-bundles` installs. CI runs `--check` as a warning-only step. Kiro's project locations are unverified (arc42 §11). Where each harness reads project files: `docs/research/project-scope-harness-locations.md`.

---

## Upgrading from v1

The v1 process (tag `legacy/process-v1`) had `software-engineer`, `engineering-manager` and `principal-engineer` agents, task DAGs, worktrees and YouTrack. v2 replaces them with the three agents above.

| v1                                                                                                 | v2                                                    |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `software-engineer`, `engineering-manager`                                                         | `engineer`                                            |
| `principal-engineer`                                                                               | `reviewer`                                            |
| `complexity-tiers`                                                                                 | `oversight` skill and `oversight` in `.aiconfig.json` |
| `plan-lifecycle`, `task-orchestration`, `worktree-management`                                      | `feature-planning`                                    |
| `agent-authoring`, `skill-authoring`, `steering-authoring`, `bundle-authoring`, `server-authoring` | `component-authoring` (`ai-engineering` bundle)       |
| ADRs                                                                                               | arc42 sections only                                   |

1. In this repo run `aif install --update`. A reinstall removes the agents, skills and rules the bundle no longer ships (and servers and hooks nothing else uses), so a managed install upgrades cleanly.
2. Files from installs the manifest never tracked are left alone: delete retired entries by hand from `~/.claude/{agents,skills,rules}` (or `~/.kiro`).
3. In each project, drop `paths.features`, `paths.decisions`, `paths.worktrees` and `orchestration` from `.aiconfig.json`, add `paths.product` and `oversight`, and copy `.githooks/`, `scripts/session-start.sh` and `.claude/settings.json` from `projects/_template/`. Plans become one `plans/{name}.md` each instead of `plans/features/{id}/`.

---

## Project Setup

Projects that use ai-foundation agents have a `.aiconfig.json` at the repo root.
Scaffold a new project with `aif init` or create the file manually.

`aif init` copies all of `projects/_template/`: `.aiconfig.json`, `plans/` and `knowledge/` skeletons, the git hooks and session-start script that keep the architecture index fresh, `.claude/settings.json` (engineer agent, session-start hook, commit/PR/session-URL attribution off), a neutral `.gitignore` (OS, editor, scratch and secrets entries), and the scheduled branch-cleanup workflow and script under `.github/` (protects only `docs`; reads the short code from `.aiconfig.json`). It refuses an existing directory; `--force` overwrites the template's files in it.

Key `.aiconfig.json` fields:

```json
{
  "project_name": "my-app",
  "project_shortname": "myapp",
  "ai_identity": {
    "git_author_name": "AI Agent",
    "git_author_email": "ai@example.com",
    "git_token_env": "AI_GIT_TOKEN"
  },
  "standards": {
    "engineering": ["csharp", "avalonia"],
    "all": []
  }
}
```

The `ai_identity` field enables agents to commit and push under a separate identity, keeping AI-authored work clearly distinct in git history and PRs.
The token is read from the named env var at runtime — never stored in the file.

`project_shortname` (max 5 characters) is a short project identifier for names and IDs, so they stay short even when `project_name` is long. It falls back to `project_name` if omitted.

See `AGENTS.md` for the full schema and `projects/_template/` for defaults.

---

## Testing

```bash
npm test               # Everything
npm run test:unit          # Fast, no I/O
npm run test:integration   # Filesystem tests
npm run test:validation    # Real repo checks
```

Requires Node.js 22.23.4+ (earlier 22.x releases have known security vulnerabilities). Install dependencies: `npm install`.

### Claude Code Cloud

This section owns the `ai-git`, `gh`, `bws` and environment-variable
parts of a cloud environment; agent selection is composed on top of it separately.
The environment's **Setup script** (set by hand in the environment settings) runs
as root and only provisions the VM. In the observed environment the repo is already cloned when it runs, but that is not guaranteed, so it never depends on the repo (except the optional agent override, which reports when it finds none). It must exit 0
and finish in about five minutes to be cached.

#### Setup script

Paste the contents of [`scripts/cloud-setup-bootstrap.sh`](scripts/cloud-setup-bootstrap.sh) into the environment's Setup script. `aif init --cloud-steps` prints it ready to copy, together with the environment variables and the other setup steps; a normal `aif init` prints them after scaffolding a project.

The script installs `ai-git` and `aif` from the head of this repo, then runs [`scripts/cloud-setup.sh`](scripts/cloud-setup.sh). That script installs pinned, sha256-verified `gh` and `bws` release binaries into `/usr/local/bin` (ahead of any cargo-built `bws` on PATH), is idempotent, and always exits 0. An optional `export AIF_AGENT=<name>` line in the pasted script starts repos as another agent (see "Primary agent").

- **Head, not a pin.** The environment installs whatever `main` of this repo holds when its cache is built. Because the script runs as root, that means trusting this repo's `main`. `--ignore-scripts` disables package install hooks, and `gh` and `bws` stay version-pinned and checksum-verified. The cache is rebuilt after about seven days, or whenever the pasted text changes, which picks up a newer head.
- **Tarball, not `github:`.** The script installs from the `codeload.github.com` tarball of `main`. `npm install -g github:…` (npm 10) reports success but links `ai-foundation` to a temporary clone that it then partly deletes, so `scripts/cloud-setup.sh` is missing and the Setup script fails with exit 127.
- **Forcing a rebuild.** Increase the `# rev:` number and save. Editing `scripts/cloud-setup.sh` in the repo does not rebuild the cache, because the pasted text stays the same.
- **Failures.** A failed `npm install` fails the script (non-zero exit), so a broken setup is never cached.

#### Environment variables

Set these in the environment's **Environment variables**, never in the script:

| Variable            | Value                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GIT_CONFIG_GLOBAL` | `/dev/null`. The harness writes `/root/.gitconfig` with its own identity; this makes a raw `git commit` fail instead of using it. |
| `BWS_PROJECT_ID`    | Bitwarden Secrets Manager project holding the token named by `ai_identity.git_token_env` (`AI_GIT_TOKEN` here). Not a secret.     |
| `BWS_ACCESS_TOKEN`  | Machine-account token for that project. The one credential in the environment; scope it to the `ai-git` credentials only.         |

#### SessionStart hook

`.claude/settings.json` runs `scripts/session-start.sh` at session start. In cloud
sessions only (`CLAUDE_CODE_REMOTE=true`) it runs, in order:

1. `npm ci --ignore-scripts`: this repo's lockfile-pinned dependencies, dev included so a session can run the full CI locally; `aif` needs the production ones (`npm link` alone does not install them). Fails on lockfile drift. A project's own scaffolded SessionStart hook should install production dependencies only (`--omit=dev`).
2. `npm link --ignore-scripts`: puts `ai-git` and `aif` on PATH.
3. `git config core.hooksPath .githooks` and `aif index architecture`: a fresh clone has no hooks yet, and the arc42 index is gitignored.
4. `ai-git doctor`: report only.

Step 1 is the hook's only network step; `gh`, `bws` and the global `ai-git`/`aif` come from the Setup script, never from SessionStart. Every step warns on failure instead of aborting, and the hook always exits 0. The hook installs no bundles: an agent or bundle a session needs is committed at project scope (`aif install --scope project`), so it applies from turn 1. The former `AIF_BUNDLES` environment variable is ignored and can be unset.

#### Verification checklist

Run in a fresh session of a repo that has `.aiconfig.json`:

1. `command -v ai-git aif gh bws` resolves all four, and `command -v bws` is `/usr/local/bin/bws` at version 2.1.0 (not a cargo-built copy).
2. `ai-git commit` (on a throwaway branch) shows the AI identity as author.
3. A raw `git commit` fails with "Author identity unknown".
4. `ai-git gh-api repos/{owner}/{repo}/issues --method POST -f title="a title with spaces"`
   works (arguments with spaces arrive intact).
5. `ai-git doctor` exits 0 and reports the token as resolved (never prints the value).

#### Primary agent

`"agent": "engineer"` in `.claude/settings.json` (set in this repo and the project template) makes the engineer the main-thread agent, so its tool set and spawn limits apply instead of the default agent's. The agent must already be installed when Claude Code launches, and the SessionStart hook runs after the agent is resolved. So the agent is committed: this repo carries its `engineering` bundle at project scope in `.claude/`, and a new project gets the same with `aif init --with-default-bundles`. Neither the Setup script nor its cache is involved, so updating the agent is a commit (`aif install --scope project --update`), never a Setup-script edit. If the agent file is missing, the harness falls back to the default agent without an error (arc42 §11).

**Overriding the agent in a cloud environment.** The committed default stays `engineer`, so a fresh checkout needs nothing. To start a cloud environment's repos as another agent, uncomment and edit the `export AIF_AGENT=<name>` line in the pasted Setup script and bump `# rev:`. `scripts/cloud-setup.sh` then writes `.claude/settings.local.json` (`{"agent":"<name>"}`) into every repo already under `/home/user`; a project's local settings outrank its committed `settings.json`, and the file is untracked and gitignored, so it survives checkouts and is never committed. Remove the line and bump `# rev:` to go back to the default. Limits:

- It is a line in the Setup text, not an environment variable: the Setup script cannot read the environment's variables.
- The name must be lowercase letters, digits, `-` or `_`, 1–64 characters, starting with a letter or digit; anything else is logged and ignored. An existing `settings.local.json` is never overwritten. A name with no agent file in the repo only logs a warning (it may be a user-level or built-in agent); if no such agent exists the harness falls back to the default agent.
- Only repos present when the environment was built are covered; the result is snapshotted with the environment, and later sessions reuse it. If the script finds no repo under `/home/user` it logs an error (`no git repo found … not applied`) and the session starts as the committed agent.
- A user-level `~/.claude/settings.json` `agent` and managed settings cannot override the committed agent (see `docs/research/cloud-setup-spikes.md`).

#### Cloud limits

- **No GraphQL.** The session proxy blocks it, so `ai-git gh-pr-*`, `gh pr ...` and
  `gh repo view` fail with HTTP 403. Use REST through `ai-git gh-api repos/{owner}/{repo}/...`;
  see `skill/pr-stewardship` for the endpoints.
- **Proxy identity.** The proxy replaces the token on GitHub API calls, so PRs, comments
  and issues are authored as the proxy identity, not the `bws` token's. Commit
  authorship (the AI identity) is unaffected.
- **Branch deletion is blocked.** The proxy refuses to delete a remote branch (REST and
  `git push --delete`); delete test branches by hand.
- **No spaces in the install path.** The `bws` re-exec puts the `ai-git` script path
  unquoted into the wrapper's command line, so the install path of ai-foundation must
  not contain spaces. The default global npm prefix does not.

---

## Contributing

This repo is framework only — no application code lives here. When adding or modifying components, use `skill/component-authoring` (installed by the `ai-engineering` bundle) for the guided procedure and validation checklist. See `AGENTS.md` for the full specification.

Work within this repo is recommended to be agent-authored using that skill.
