# Run: one sweep job per job type instead of schedules per club (#629, E22-S03)

- **Goal and trigger:** cezar task 8be8da53 (`om-auto-fix-issue 629`, issue labelled `cezar`). Build phase 1 of
  `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`: replace the 19 per-club schedules with one sweep schedule
  per job type, keep each club's local time, idempotency and logs, keep `run-job --tenant --org`.
- **Issue / epic / branch:** #629 (E22-S03), epic #626; branch `refactor/issue-629-sweep-job-per-type`.
- **Approvals:** the owner approved the migration this phase needs (`foundation_club_jobs`) in a comment on #629
  (2026-11-23); the two system-scope sweep statements are approved by Q-M05 (DD-M07). Spec PR #644 merged with the
  spec `Ready for implementation`. No `db:migrate` against a real or dev database was run.
- **Started:** 2026-11-23.

## Steps

1. Claimed #629 (assignee, `in-progress`, claim comment naming this worktree and branch).
2. Read the spec, the platform scheduler (`schedulerService`, `execute-schedule.worker`, safe queue targets) and queue
   (`@open-mercato/queue` 0.9.0: `enqueue(data, { delayMs })`, no job id option).
3. `foundation/lib/club-job-due.ts` (due times: local `HH:MM` + stable 0–20 min offset, DST via `zonedInstant`, interval
   slots, DD-M06 cap, retry, per-club spec for the rollback) and `foundation/lib/club-job-run.ts` (sweep passes and the
   claimed run, failure isolation), both at 100 % unit coverage.
4. `ClubJob` entity + `Migration20261123071211_foundation` (`yarn db:generate`, reviewed: one table, the two indexes of
   the spec, nothing else); raw SQL in `foundation/data/queries.ts`.
5. `foundation/services/club-jobs.ts`: declarations registry, `setUpClubJob`/`initClub`/`removeClub`/`wake`, the sweep,
   `clubJobWorker`, retire/restore/status; `workers/club-job-sweep.ts`; the system-scope path of
   `workers/dispatch-sweep.ts` (`sweepAllDispatches`); `subscribers/reschedule-club-jobs.ts`; `cli.ts`.
6. Modules: `lib/club-jobs.ts` declarations in `activities`, `facilities`, `payments`, `people` (declared from `di.ts`),
   their `club-setup.ts` onto `setUpClubJob`, their 18 workers wrapped with `clubJobWorker`.
7. Integration tests TEST-M05 and TEST-M06; docs (`docs/ops/deploy.md` per-club jobs table and runbook,
   `monitoring.md`, `incident.md`); `AGENTS.md` records the DD-M07 exceptions; spec status `In progress` and a
   changelog file.

## Decisions

- **No BullMQ job id.** The platform queue cannot set one, so the claim (due time + lease value, ms precision, written
  from JS) travels in the payload and the run's start is a conditional update on both: a stale copy is skipped. Finish
  is fenced on the run lease, so a run that outlived its timeout changes nothing after a take-over.
- **The rollout switch is the sweep schedule itself**, not a config row: while a job type has no sweep schedule, club
  setup still registers its per-club schedule (existing tests and environments keep working); `retire-club-schedules`
  creates the job state of every club with the old schedule, registers the sweep, then removes the per-club rows (a
  run may happen twice at the switch, never not at all). `restore-club-schedules` is the rollback.
- **A failed run** is caught by `clubJobWorker`: error code only (never the message) in `last_error`, retry after
  15 minutes; the queue job does not fail, so one club never blocks or retries another.
- **Next due after a run** is computed from `max(now, claimed due time)`, so a worker clock behind the sweep's never
  re-runs the same slot.
- **Kept for release N+1:** the `activities`/`payments` re-register subscribers (now through `setUpClubJob`, so they
  re-register only job types not yet on their sweep) and per-club registration code (spec *Rollout*).
- **`people:life-cycle`** keeps its rule: set up only for a new club or by `people life-cycle --register-schedule`.

## Files changed

See the PR diff: `foundation` (entity, migration, queries, lib, services, worker, subscriber, CLI, DI, index, setup),
`activities|facilities|payments|people` (`lib/club-jobs.ts` + tests, `di.ts`, `services/club-setup.ts`, workers),
`packages/app/.ai/qa/tests/foundation/TEST-M05-*.spec.ts`, `TEST-M06-*.spec.ts`, `docs/ops/*.md`, `AGENTS.md`, the
spec and its changelog file, this log.

## Commands and results

- `npx jest … foundation/lib` with coverage: `club-job-due.ts`, `club-job-run.ts` 100 % lines/branches/functions.
- `yarn generate`: ok. `yarn typecheck`, `yarn workspace @vereino/app typecheck:qa`: ok.
- First local run of the retire test failed: `Expected: 0 Received: 17` (no run finished in 180 s; the worker log showed
  34 × "Club job run skipped: its claim no longer holds"). Cause: the test set `next_due_at` with SQL `now() - interval`
  (microseconds), the claim travels as JS dates (milliseconds), and the start compared with `=`. Fix: compare with
  `date_trunc('milliseconds', …)` (f046a4b2); lesson `platform-queue-has-no-job-id-fence-with-claim`.
- A build of the same run failed on `club-job-due.ts` template-literal types after a lint fix; fixed (a263a314).
- The spec's ids TEST-M05/M06 already name `communication` tests, and `--filter` matches paths, so the files are
  `foundation/ISSUE-629-club-job-sweep.spec.ts` (TEST-M05) and `ISSUE-629-retire-club-schedules.spec.ts` (TEST-M06).
- Final local integration runs (`yarn test:integration:vereino --filter <id>`, one per run): ISSUE-629-retire-club-schedules
  passed (35.1 s), ISSUE-629-club-job-sweep passed (24.0 s); older schedule tests TEST-C14, ISSUE-221, ISSUE-192,
  ISSUE-525, TEST-A20 passed.
- `yarn verify`: all 21 steps passed. `yarn guard`: no blocking findings (warning: `AGENTS.md` changed — the DD-M07
  exception record the spec asks for).

## Open problems / next steps

- Operator step (Ask First on staging/production): `yarn mercato foundation retire-club-schedules` after the deploy.
- Follow-ups: the per-sweep payments invariants heartbeat (*Observability*); modules returning `nextDueAt` to skip
  empty runs (DD-M06); release N+1 removes the per-club registration code and the two re-register subscribers.
