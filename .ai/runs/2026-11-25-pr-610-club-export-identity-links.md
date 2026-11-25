# Run: PR #610 club export fails after merging main (issue #566)

- **Goal and trigger**: cezar task (om-auto-fix-pr, CI only): the required check `integration (shard 2/6)` fails on
  PR #610 head 806f8cf (run 45462715858) — TEST-M07 and TEST-M11 end with `club_core.export.failed`. Fix the root
  cause on the PR branch without skipping or quarantining the tests, push, never merge.
- **Issue / PR / branch**: #566 / #610 / `feat/issue-566-social-sign-in-google` (worked on a detached HEAD at its tip,
  pushed with `git push origin HEAD:feat/issue-566-social-sign-in-google`).

## Steps

1. Merged `origin/main` into the PR head: already up to date.
2. Read the CI log: the job only shows `club_core.export.failed` (the export job maps every error to that code).
3. Read `club_core/lib/club-offboarding.ts`: export and delete refuse while a table with `tenant_id` is not covered
   (`uncoveredTables`). The PR adds `vereino_identity_links` (foundation `IdentityLink`, scoped) and no module lists
   it; #677 (#632), merged into the branch, introduced the check.
4. Added `vereino_identity_links` to `FOUNDATION_CLUB_TABLES` (`data`: exported with `email_at_link` decrypted, and
   restored, so a restored club's members keep their provider sign-in). Updated the foundation unit test, whose
   `foundation_` prefix assertion the table name would break.
5. Ran the unit tests and TEST-M07 / TEST-M11 locally (results below).
6. Recorded lesson `new-tenant-table-joins-the-club-tables-list`.

## Decisions

- `data`, not `secret`: a link holds a provider subject id and an encrypted e-mail, no credential; deleting it on
  restore would silently cut members off their social sign-in.

## Files changed

- `packages/app/src/modules/foundation/lib/club-tables.ts`
- `packages/app/src/modules/foundation/lib/__tests__/club-tables.test.ts`
- `.ai/lessons/new-tenant-table-joins-the-club-tables-list.md`
- this log

## Commands and results

- `npx jest src/modules/foundation/lib/__tests__/club-tables.test.ts src/modules/club_core/lib`: 21 suites, 223 tests
  passed.
- `yarn lessons:check`: valid.
- First `yarn test:integration:vereino --filter TEST-M07`: `Module not found: Can't resolve 'arctic'` (the worktree had
  not installed the PR's new dependency); after `yarn install --immutable`:
- `yarn test:integration:vereino --filter TEST-M07`: 2 passed (1.4m).
- `yarn test:integration:vereino --filter TEST-M11`: 1 passed (48.7s).

## Open problems / next steps

- Push and let CI (`integration (shard 2/6)`) confirm on the PR.
- `yarn typecheck`: passed. `yarn guard`: no findings.
