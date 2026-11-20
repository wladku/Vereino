# Run: PR #474 to merge-ready (issue #464, E18-S03)

- **Trigger**: Cezar run, `om-auto-fix-pr 474`, 2026-11-20. The PR conflicted with `main`, so the merge train skipped it.
- **Issue / PR / branch**: #464 / #474 / `feat/issue-464-nightly-encrypted-db-backup` (worked on a detached HEAD at
  `origin/feat/issue-464-nightly-encrypted-db-backup`, pushed with `git push origin HEAD:<branch>`; no force-push).

## Steps and decisions

1. Claimed #474 (assignee, `in-progress`, 🤖 comment).
2. Merged `origin/main` (up to `91866b02`). One conflict, `packages/app/package.json` `test:scripts`: `main` added
   `--test-coverage-include="../../scripts/merge-train-trailers.mjs"`, this PR added `../../scripts/backup-*.mjs` and
   the `test:backup` script. Kept both. The include order must match `coverage-scope.test.mjs` (backup after
   `ci-failure-ledger-plan.mjs`); the first resolution had it after the trailers include and that test failed with a
   `deepStrictEqual` diff, so the order was fixed.
3. Review of the PR diff (scripts, image, Railway config, workflow, docs): no blocking finding. No Ask First item:
   no npm dependency, no migration, no contract change; owner actions (bucket, age key, Railway service) stay out of
   scope as the PR says.
4. Found a cross-PR gap: the E18-S04 run (#476, note on #464) defines the failed/missed-backup alert as a heartbeat
   via `vereino-ops-signal.mjs` because Railway Hobby has no log-match alerts, while `docs/ops/backups.md` here speaks
   of a Railway log alert. #476 is not on `main`, so this is filed as follow-up #519 instead of growing this PR.

## Commands and results

- `yarn workspace @vereino/app test:scripts` after the fix: 331 tests, 331 pass; `backup-common.mjs`,
  `backup-dump.mjs`, `backup-restore.mjs` and all files at 100 % lines, branches, functions.
- `yarn test:backup`: 3/3 pass (ENG-TEST-10 restore with equal row counts, wrong key touches no database, missing
  bucket variables).
- `yarn verify` on the merge commit: all 18 steps passed (exit 0). No integration test is added or changed by this PR or by the merge, so no `test:integration:vereino` run was needed.

## Files changed

- `packages/app/package.json` (merge resolution), this run log.

## Open problems / next steps

- Follow-up #519: wire the backup job to the E18-S04 heartbeat once #474 and #476 are both on `main`.
- Merge stays with the merge train / `om-approve-merge-pr`.
