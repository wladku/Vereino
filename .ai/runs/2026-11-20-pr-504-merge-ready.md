# Run: PR #504 merge-ready (merge-train conflict)

- **Goal and trigger**: cezar task — PR #504 was `CONFLICTING` with the `merge-train-conflict` label; merge `main` in, no force-push, never merge the PR.
- **Branch**: `chore/coverage-scope-by-convention` (worked on a detached HEAD at its origin tip, pushed with `git push origin HEAD:chore/coverage-scope-by-convention`).
- **Issue/spec**: none (tooling change; S13.6 of the engineering standards spec already updated by the PR).

## Steps

1. Merged `origin/main` (tip `93f4c329`, #474 off-site backup) into the PR head `6bd86f16`.
2. Conflicts in `AGENTS.md`, `packages/app/package.json` and `packages/app/scripts/__tests__/coverage-scope.test.mjs`: #474 had added `scripts/backup-*.mjs` to the three hand-kept lists this PR replaces.
3. Resolution: kept the PR's convention (globs, exclude list, derived covered set, convention wording in AGENTS.md) and main's new `test:backup` script. No `backup-*` include is needed: the root `../../scripts/*.mjs` glob covers `backup-common.mjs`, `backup-dump.mjs` and `backup-restore.mjs`.

## Decisions

- Did not add an exclude for the backup scripts: they are Vereino tooling with their own tests, so they belong under the 100 % rule (as on `main`).
- The covered set is 22 files: the three backup scripts that #474 already covered on `main` join the 19 of the previous merge.

## Commands and results

- `yarn test:scripts` → 333 tests, 333 pass, 0 fail; all files 100 % lines / branches / functions, including the three `backup-*.mjs`.
- `yarn format:check`, `yarn lint`, `yarn lessons:check`, `yarn spec-changelogs:check` → exit 0.
- No integration test is added or edited by this PR, so none was run.

## Open problems / next steps

- CI on the pushed merge commit; then the merge train picks the PR up (labels: `merge-train-conflict` removed).
