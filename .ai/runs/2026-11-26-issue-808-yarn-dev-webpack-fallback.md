# Run: issue #808 — yarn dev's webpack fallback never reaches a running app

- **Trigger**: Cezar run, `cezar` label on #808 (om-auto-fix-issue), 2026-11-26.
- **Issue**: https://github.com/wladku/Vereino/issues/808 (`bug`, `priority-medium`, `risk-low`)
- **Branch**: `fix/issue-808-yarn-dev-webpack-fallback`
- **Spec**: none (bug fix, `direct` route)

## Goal

On Linux/WSL2 with inotify limits `yarn dev` cannot raise, `scripts/dev.mjs` fell back to `next dev --webpack`, under which the app crashes or answers HTTP 500. The issue offered two "Done when" options and left the choice to the owner.

## Decision

Option 1: `yarn dev` no longer falls back to webpack; with low limits it stops and names `yarn dev:fix-wsl-watchers`, exactly as `OM_DEV_BUNDLER=turbopack` already did. Reasons: smallest, reversible change in dev tooling only; every Vereino check (CI, integration, browser smoke) runs Turbopack, so option 2 would need three bundler fixes plus a new webpack check in CI to stay true. `OM_DEV_BUNDLER=webpack` stays an explicit opt-in. No owner comment chose otherwise; the PR body records the choice so the owner can ask for option 2.

## Steps

1. Claimed #808 (assignee, `in-progress`, 🤖 claim comment naming this worktree).
2. `packages/app/scripts/dev-inotify-limits.mjs`: `resolveDevBundlerDecision` returns Turbopack (no fallback) for `auto` whatever the inotify result; dropped the unused `inotifyResult` parameter; the failure message now names `yarn dev:fix-wsl-watchers` and says to start `yarn dev` again.
3. `packages/app/scripts/dev.mjs`: removed the dead fallback branch (set `OM_DEV_BUNDLER=webpack` and continue).
4. Regression test `packages/app/scripts/__tests__/dev-inotify-limits.test.mjs` (runs in `yarn test:scripts`): 4 tests pass; against the old module 2 of them fail (fallback to webpack, message without the fix command).
5. Lesson `.ai/lessons/dev-runner-no-silent-webpack-fallback.md`.
6. `yarn verify` (see results).

## Files changed

- `packages/app/scripts/dev-inotify-limits.mjs`
- `packages/app/scripts/dev.mjs`
- `packages/app/scripts/__tests__/dev-inotify-limits.test.mjs` (new)
- `.ai/lessons/dev-runner-no-silent-webpack-fallback.md` (new)
- this run log

## Commands and results

- `node --test packages/app/scripts/__tests__/dev-inotify-limits.test.mjs` → pass 4, fail 0
- same test against the `HEAD` copy of the module → pass 2, fail 2 (expected: proves the regression)
- `yarn lessons:check` → valid
- `yarn verify` → all 23 steps passed (lint, typecheck, test, test:scripts, build, checks)

No integration test: the change touches only the dev runner, which no integration test starts (they use the production build).

## Open problems / next steps

- Under explicit `OM_DEV_BUNDLER=webpack` the app still fails to compile (the three causes listed in #808). Making webpack work is option 2 of the issue, left for the owner to request.
