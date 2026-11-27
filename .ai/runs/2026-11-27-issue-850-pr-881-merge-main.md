# Run: PR #881 — merge main (issue #850)

- **Goal and trigger:** cezar task (om-auto-fix-pr) — PR #881 (issue #850: a deleted club's queued jobs end on their
  own; TEST-M07 asserts cache entries) carried `merge-train-conflict`. Merge `main` in without rewriting history, run
  the edited integration test locally, push, never merge.
- **Spec / issue / branch:** `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`, #850, PR #881, pushed from a
  detached HEAD to `docs/issue-850-amend-deletion-targets-queued-jobs`.

## Steps

1. Claimed the PR (assignee, `in-progress`, 🤖 comment). Detached at
   `origin/docs/issue-850-amend-deletion-targets-queued-jobs` (`8dbafc69`), merged `origin/main` (`b552f4a5`).
2. One conflict, in the imports of `packages/app/.ai/qa/tests/club_core/TEST-M07-club-export-delete-restore.spec.ts`:
   this branch added `createCacheService, runWithCacheTenant` from `@open-mercato/cache`; main switched
   `getAuthToken`/`clearAuthTokenCache` from the platform helper to `../_fixtures/auth` (lesson
   `qa-tests-take-get-auth-token-from-the-auth-fixture`). Kept both.
3. Ran `yarn test:integration:vereino --filter TEST-M07` locally (result below).

## Decisions

- No review findings to fix; the PR is docs plus one test change. No Ask First item is touched.

## Files changed

- `packages/app/.ai/qa/tests/club_core/TEST-M07-club-export-delete-restore.spec.ts` (merge resolution)
- this run log

## Commands and results

- `yarn test:integration:vereino --filter TEST-M07`: 2 passed (1.7m) — `club_core/TEST-M07-club-export-delete-restore` (43.8s) and
  `communication/TEST-M07-session-cancellation` (12.9s; the filter matches both).
- `yarn guard`: no blocking findings. `yarn qa-texts:check`: 0 problems.

## Open problems / next steps

- The merge train picks the PR up again once CI is green.
