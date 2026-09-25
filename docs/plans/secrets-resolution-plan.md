# Pluggable Secrets Resolution for `aif`

> Status: Draft
> Created: 2026-09-25
> Approved by: Pending

## Goal

Give `aif`-managed tooling (`ai-git`, `aif install`) a provider-agnostic way
to source secrets (`AI_GIT_TOKEN`, MCP server tokens like
`YOUTRACK_TOKEN`) from a secrets manager instead of requiring a plain
exported environment variable, without hard-coding any specific provider
(Bitwarden Secrets Manager is the first concrete user, not a special case).

## Components Affected

| Component                                                              | Action | Notes                                                                         |
| ------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| `lib/secrets.js`                                                       | Create | Pure logic: config parsing, dotenv parsing, placeholder resolution, wrapper-invocation building |
| `lib/harnesses/claude.js`                                              | Modify | `resolveHeaderPlaceholders` delegates to the extracted `resolvePlaceholders` |
| `bin/ai-git.js`                                                        | Modify | Reactive secrets resolution before token use                                 |
| `bin/aif.js`                                                           | Modify | Proactive secrets resolution scoped to `install`/`uninstall`                 |
| `.aiconfig.json` (this repo)                                           | Modify | Add `secrets.run` wired to `bws run`                                         |
| `.gitignore`                                                           | Modify | Ignore `.env` / `.env.*`, keep `.env.example`                                |
| `.env.example`                                                         | Create | Documents expected var names, insecure-fallback opt-in                       |
| `AGENTS.md`                                                            | Modify | Document `secrets.run` / `secrets.allow_insecure_dotenv` fields              |
| `projects/_template/.aiconfig.json`                                    | Modify | Add commented example `secrets` block                                       |
| `docs/decisions/architecture/AIF-ARCH-008_secrets-resolution.decision.md` | Create | ADR recording the run-wrapper-first design and known limitation              |
| `tests/unit/secrets.test.js`                                           | Create | Unit coverage for `lib/secrets.js`                                           |
| `tests/integration/ai-git-auth.test.js`                                | Modify | Add wrapper re-exec case + dotenv fallback case                              |

## Approach

1. **`lib/secrets.js`** — pure module (no I/O), mirroring `lib/ai-git.js`'s split: `getSecretsConfig(config)`, `resolvePlaceholders(value, env)` (throws on unset var), `parseDotenv(text)`, `REEXEC_GUARD_ENV`, `isAlreadyWrapped(env)`, `buildWrapperInvocation(run, execPath, scriptPath, args, env)`.
2. **Extract shared placeholder logic** — `lib/harnesses/claude.js`'s `resolveHeaderPlaceholders` calls the new `resolvePlaceholders` instead of its own private regex; its existing exported behavior and tests are unchanged.
3. **`bin/ai-git.js` wiring** — after identity is loaded, if `identity.tokenEnvName` is set and missing from `process.env`: re-exec through `secrets.run` (guarded, once) if configured, else load `.env` if `allow_insecure_dotenv` is `true` (warn on stderr), else proceed unchanged (today's "token missing" errors still fire downstream).
4. **`bin/aif.js` wiring** — at the top of `run()`, only for `install`/`uninstall`: same precedence, but proactive (wrap/dotenv-load once before any command logic runs, since the exact var names needed aren't known until deep inside the per-server loop). Every other command (`status`, `list`, `validate`, `test`, `snapshot`, `index`, `init`, `config`) is untouched.
5. **`.gitignore` + `.env.example`** — add `.env`/`.env.*` ignores; commit a `.env.example` with placeholder var names and a comment describing the insecure-fallback opt-in.
6. **Dogfood this repo** — add `"secrets": {"run": ["bws", "run", "--project-id", "${BWS_PROJECT_ID}", "--"]}` to this repo's own `.aiconfig.json`. Actual Bitwarden project/secret provisioning (`bws` install, `BWS_ACCESS_TOKEN`/`BWS_PROJECT_ID`, registering `AI_GIT_TOKEN`/`YOUTRACK_TOKEN` as secrets) is a manual step outside this session's tool access — will be called out explicitly, not claimed as done.
7. **Docs** — `AGENTS.md` field table + short prose; `projects/_template/.aiconfig.json` gets a bracket-placeholder example matching the template's existing `ai_identity` convention; ADR `AIF-ARCH-008` records the options considered and the known `~/.claude.json`-plaintext limitation for MCP HTTP headers (accepted, not solved here). Run `aif index decisions` after adding the ADR.
8. **Tests** — new `tests/unit/secrets.test.js`; extend `tests/integration/ai-git-auth.test.js` with a fake-wrapper-script case (never-log-the-token guarantee holds through the wrapper path too) and a `.env`-fallback case.

## Open Questions

None — design was reviewed and approved with the human in chat prior to this plan being drafted; this file records that same approved design per `skill/plan-lifecycle`'s commit-gate requirement.

## Risks

- **Re-exec adds one extra subprocess hop** for `ai-git` token-needing calls and for every `aif install`/`uninstall` when `secrets.run` is configured. Accepted — negligible cost, and scoped away from the common no-secret commands.
- **`secrets.allow_insecure_dotenv` could be left on accidentally.** Mitigated: defaults to `false`, requires an explicit opt-in in `.aiconfig.json`, and prints a stderr warning every time it's actually used.
- **MCP HTTP header secrets still land in `~/.claude.json` in plaintext** (existing behavior, unrelated to this change). Documented as an accepted limitation in the ADR rather than silently left implicit.

## Validation

- `npm test` (unit + integration) — new `secrets.test.js`, updated `claude-adapter.test.js`, extended `ai-git-auth.test.js`.
- Manual regression: with no `secrets` config, confirm `ai-git`/`aif install` behave exactly as before.
- Manual (once the user provisions BWS locally): `ai-git gh-repo-view` and `aif install --bundle engineering --harness claude` resolve tokens via the wrapper.
- Manual: `.env` fallback path prints its warning and never appears in `git status`.

## Out of Scope

- Provisioning an actual Bitwarden Secrets Manager account/project — that's a manual step for the human, outside this session's tool access.
- Closing the `~/.claude.json` plaintext-header limitation — would require harness-side support, tracked as a revisit trigger in the ADR, not built here.
- A local per-developer `.aiconfig.json` override file (e.g. `.aiconfig.local.json`) for toggling `allow_insecure_dotenv` without touching the committed config — noted as a possible future enhancement, not built now.
