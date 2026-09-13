<!-- Instructions live in comments like this one and won't appear in the rendered PR. -->

## Summary

<!-- What does this change do, and why? -->

## Checklist

- [ ] `npm run lint` passes <!-- ESLint; run `npm run lint:fix` for auto-fixable issues -->
- [ ] `npm run typecheck` passes <!-- JSDoc types checked via tsc --noEmit -->
- [ ] `npm run format:check` passes <!-- run `npm run format` to fix -->
- [ ] `npm test` passes <!-- node --test; add/update tests for behavior changes -->
- [ ] `npm run validate` passes <!-- schema/reference/bundle validation, if this touches agents/skills/bundles -->
- [ ] Snapshots are current <!-- `node bin/aif.js snapshot --check`; regenerate if bundles/servers/hooks changed -->
- [ ] Version bumped <!-- if this changes published package behavior; CI checks this against the base commit -->

## AI disclosure

<!-- Did you use AI assistance (e.g. Claude, Copilot) to write this PR, and if so, how did you review the output? -->
