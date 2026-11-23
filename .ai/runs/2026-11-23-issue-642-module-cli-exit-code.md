# Run: issue #642 — Vereino module CLIs exit 1 after usage errors

- **Trigger**: Cezar run (task 8f2ed0b0), `om-auto-fix-issue 642`, issue labeled `cezar` on 2026-11-23.
- **Issue**: #642 — `@open-mercato/cli` runs a module command as `await cmd.run(rest); return 0` and `bin.js` ends with `process.exit(code ?? 0)`, so `process.exitCode = 1` in a `ModuleCli.run` is lost and the run exits 0.
- **Branch**: `fix/issue-642-module-cli-exit-code`
- **Route**: `debugging` + `module-data` (CLI); delivery `direct` (bug fix, no spec).

## Steps

1. Claimed #642 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Listed every `process.exitCode` in `packages/app/src/modules/*/cli.ts`: 28 sites in 6 modules (activities, club_core, facilities, groups, payments, people). 24 are usage errors (`exitCode = 1; return` after the usage text on stderr). The other 4 are failed steps: a `set-up-club` schedule that was not registered (activities, facilities, payments) and `people life-cycle --register-schedule` when the schedule was not registered.
3. Each usage error now writes the usage to stderr, then throws `new Error('[internal] <module> <command>: invalid options')`. Each failed step prints its JSON result, then throws an `[internal]` error. `people retention-sweep` is not on `main` yet: PR #643 (#564) adds the same fix for it.
4. Added the ESLint rule `vereino/module-cli-exit-code` (`no-restricted-syntax` on an assignment to `process.exitCode`) for each Vereino module `cli.ts` (`eslint.vereino.mjs` `vereinoModuleCliConfigs`, wired in `packages/app/eslint.config.mjs`). `yarn lint`, and so `yarn verify`, now fails on the pattern. Two unit tests cover the rule in `packages/app/scripts/__tests__/eslint-vereino.test.mjs`.
5. Added integration test `ISSUE-642` (`packages/app/.ai/qa/tests/platform/ISSUE-642-module-cli-exit-code.spec.ts`). It runs each of the 24 usage-error paths through `yarn mercato` and expects exit 1 and the usage text on stderr.
6. Added lesson `mercato-module-cli-exit-code` as a byte-identical copy of the record in PR #643 (same blob `e6586aca`), so whichever PR merges second has no add/add conflict. Its sentence "About 30 Vereino CLI commands still use the pattern" becomes outdated once this PR lands. It can be edited after both PRs merge.

## Decisions

- **Lint rule instead of a new verify step**: ESLint already runs in `yarn verify`. A `no-restricted-syntax` selector needs no new script or verify step. Scope is `src/modules/<id>/cli.ts` only. Other code may still read `process.exitCode`.
- **Schedule failures throw after printing the result**: the JSON output still shows which schedule failed, and the exit status is now 1.

## Verification

- `node --test packages/app/scripts/__tests__/eslint-vereino.test.mjs`: 12/12 pass.
- `npx eslint` on `main`'s `people/cli.ts` (stdin): 6 `no-restricted-syntax` errors at the 6 old sites. On the changed `src/modules/*/cli.ts`: 0 errors.
- `yarn test:integration:vereino --filter ISSUE-642`: 1 passed (10.3 s).
- `yarn verify`: first run failed at `format:check` (the three `set-up-club` throw lines were too long); after `yarn format` every step passes (EXIT=0).

## Open problems / next steps

- After #643 merges, check that `people retention-sweep` has no `process.exitCode`. If it does, the lint rule fails on `main`.
