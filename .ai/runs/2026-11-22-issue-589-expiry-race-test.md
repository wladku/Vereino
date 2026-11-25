# Run — issue #589: the expiry job reports `skipped` for a row a command moved first

- **Trigger**: `cezar` label on #589 (cezar run, `om-auto-fix-issue`), 2026-11-22.
- **Issue / spec**: #589 (epic #565); `.ai/specs/implemented/2026-10-27-vereino-foundation-scheduling-primitives.md` — AC-G02, TEST-G03 (declaration part).
- **Branch**: `test/issue-589-job-status-skipped-rows`.

## Goal

An integration test that moves a declaration by a command after the expiry job read it and proves the job reports it `skipped`, emits nothing for it (leaves it out of `changedIds`) and that the lock token is the command's.

## Steps

1. Claimed #589 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read `activities.attendance.expire` (`commands/attendance.ts`) and `advanceWhere` (`foundation/services/transitions.ts`): the job counts the due rows, selects the candidates, then runs one conditional UPDATE per row; `skipped = due − moved`; events go out only for `changedIds`.
3. No production test hook exists, so the test orders the race with PostgreSQL row locks: it holds the declaration's row lock (`select … for update`), sends the guardian's decision (it queues — `authorizeScoped` loads with `PESSIMISTIC_WRITE`), starts the expiry CLI (it reads the row as `pending_guardian`, then its UPDATE queues behind the decision) and rolls back. The decision commits first; the job's UPDATE re-checks its WHERE and changes 0 rows.
4. Added `runExpiryAsync` to `_fixtures/attendance.ts` and `activities/TEST-G03-expiry-race-skipped.spec.ts`; a second, untouched declaration proves the same run still moves what it wins.
5. Spec AC-G02 line: #589 gap replaced by the test as evidence (AC stays open on #588); changelog file added; lesson recorded.

## Decisions

- **No production hook**: the spec allows one, but a test-held row lock makes the race deterministic without touching the command; nothing ships for tests only.
- **Decision request through `apiRequest` with a long timeout and `retryTransport: false`**: it waits on the lock while the job's CLI boots (longer than the fixtures' 30 s), and a retry would send the command twice.
- **Events**: asserted through `changedIds` (the command emits `activities.attendance.guardian_decided` exactly for those ids after commit) and the row's lock token being the decision's, not the job's `now`.

## Commands and results

- `npx tsc --noEmit -p .ai/qa/tests/tsconfig.json` — clean.
- `yarn test:integration:vereino --filter TEST-G03`, runs 1–4 failed: "the expiry job queues on the declaration's row lock … Received: 0". Diagnostics showed every backend `idle` with stale queries: `pg_stat_activity` is snapshotted once per transaction and the polls ran on the lock-holding connection. Fix: poll on a second connection (lesson `race-tests-hold-a-row-lock-and-watch-from-a-second-connection`).
- Run 5 collided with run 4 still in its retry ("Another Open Mercato production server is already running"); rerun after it ended.
- Run 6: `1 passed (41.1s)` (test 10.8 s). Run 7 (stability): `1 passed (40.8s)`.
- `yarn verify`: all 20 steps passed.

## Files changed

- `packages/app/.ai/qa/tests/activities/TEST-G03-expiry-race-skipped.spec.ts` (new)
- `packages/app/.ai/qa/tests/_fixtures/attendance.ts` (`runExpiryAsync`)
- `.ai/specs/implemented/2026-10-27-vereino-foundation-scheduling-primitives.md` (AC-G02 evidence)
- `.ai/specs/changelog/2026-10-27-vereino-foundation-scheduling-primitives/2026-11-22-issue-589-expiry-race-test.md`
- `.ai/lessons/race-tests-hold-a-row-lock-and-watch-from-a-second-connection.md`

## Open problems / next steps

- AC-G02 stays open on #588 (`reopen`, owner decision). The session-table part of TEST-G03 (no job advances sessions today) is not covered here.
