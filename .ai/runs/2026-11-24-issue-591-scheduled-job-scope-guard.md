# Run: #591 — scheduled jobs dispatch through the platform worker and refuse a forged scope (AC-G05, TEST-G06)

- **Trigger:** cezar task (issue labelled `cezar`), skill `om-auto-fix-issue` with the repo-local override.
- **Issue:** #591 (epic #565). **Spec:** `.ai/specs/implemented/2026-10-27-vereino-foundation-scheduling-primitives.md` — AC-G05, TEST-G06, REQ-G05, DD-G07.
- **Branch:** `fix/issue-591-scheduled-job-scope-guard` (renamed from the cezar task branch).
- **Owner decision (issue comment, 2026-11-24):** a forged scope is also a well-formed organization id without a registration of the job; the check lives in one shared helper, not in each worker.

## Steps

1. Claimed #591 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read the platform scheduler (`@open-mercato/scheduler`): `execute-schedule.worker.ts` compares the firing's scope with the row, sanitises the stored payload and enqueues the target job with the row's `tenantId` / `organizationId` and `_jobOrigin: 'scheduler'`. Nothing stops another producer putting a well-formed scope straight on a Vereino queue, and the workers checked only the shape (Zod).
3. Added `foundation/services/scheduled-job-scope.ts` → `verifyScheduledJobScope(container, payload, { module, name })`: Zod shape, then one primary-key lookup of `scheduled_jobs` under the stable id `registerModuleSchedule` writes (`stableScheduleUuid(moduleScheduleKey(…))`, now exported), also matching tenant, organization, organization scope, module source, queue target, enabled and not deleted. Refusals (`malformed_scope`, `unregistered_scope`) are logged as warnings and returned, never thrown (a retry cannot change them). Exported from `@/modules/foundation`.
4. All 19 Vereino scheduled workers (activities 5, facilities 4, payments 6, people 3, foundation `dispatch-sweep`) now call it instead of their own Zod schema. `foundation:dispatch-deliver` is not a scheduled worker (its payload is a delivery id published by the dispatcher) and is unchanged.
5. The messaging probe's `sweep` step now registers the club's `foundation:dispatch-sweep` schedule first: test clubs are created through the API, which runs no `seedDefaults`, so without it the sweeper would (correctly) refuse the club.
6. TEST-G06 (`.ai/qa/tests/foundation/TEST-G06-scheduled-job-dispatch.spec.ts`) with a QA-only probe (`_fixtures/scheduled-job-probe/probe.mjs`) that calls the real platform `scheduler-execution` worker and then the module's worker on the payload it queued, recording every dispatched command.
7. Spec: AC-G05 ticked with evidence; changelog file `changelog/2026-10-27-vereino-foundation-scheduling-primitives/2026-11-24-issue-591-ac-g05.md`. Foundation README worker convention updated.

## Decisions

- Raw parameterised SQL on `scheduled_jobs` instead of importing the scheduler's entity: no deep import of a platform package's internals, one indexed primary-key read per job run.
- The registration must be enabled: the platform's execute worker already skips a disabled schedule, so a payload for one is not a legitimate run.
- Worker header comments that say "re-validates them" are left as written (still true; the guard re-validates and more) to keep the diff to the behaviour change.
- No new route, no migration, no contract change: worker queue ids and payloads are unchanged; a payload that was accepted before is still accepted when its organization holds the registration, which every scheduler-produced payload does.

## Files

- `packages/app/src/modules/foundation/services/scheduled-job-scope.ts` (new), `register-module-schedule.ts`, `index.ts`, `README.md`, `workers/dispatch-sweep.ts`
- `packages/app/src/modules/{activities,facilities,payments,people}/workers/*.ts` (18 files)
- `packages/app/.ai/qa/tests/foundation/TEST-G06-scheduled-job-dispatch.spec.ts` (new), `_fixtures/scheduled-job-probe/probe.mjs` (new), `_fixtures/messaging-probe/probe.mjs`
- `.ai/specs/implemented/2026-10-27-vereino-foundation-scheduling-primitives.md`, its changelog file

## Commands and results

- `yarn generate` (fresh worktree), then `yarn typecheck` — clean.
- `yarn test:integration:vereino --filter TEST-G06` — first run failed in the test itself: `expect(setUp.schedules['generate-occurrences']).toBe(true)` received `undefined` (`activities set-up-club` returns camelCase keys, `generateOccurrences`). Fixed the test; rerun: `1 passed (56.3s)`.
- `yarn test:integration:vereino --filter TEST-M02` (messaging probe `sweep` step changed) — `1 passed (1.1m)`.
- `yarn verify` — failed at `format:check` (19 files unformatted); `yarn format`, then `yarn verify --from format:check` — `all 16 step(s) passed` (generate, typecheck, typecheck:packages, typecheck:qa, lint and secrets:check had passed in the first run).
- `yarn guard` — no blocking findings.

## Open problems / next steps

- None. Header comments of the workers still say "re-validates them" (accurate; left as written).

## Merge of `main` (2026-11-24, PR #692 `merge-train-conflict`)

Trigger: om-auto-fix-pr on #692 after `main` took #663 (#629, one sweep job per job type instead of schedules per club), which wrapped every per-club worker in `clubJobWorker` and gave `foundation:dispatch-sweep` a system-scope path. All 19 workers and `foundation/index.ts` conflicted.

Decisions:
- The guard moved into `clubJobWorker` (`foundation/services/club-jobs.ts`), which now hands the handler `(scope, job)` with a trusted scope only. A claimed job (the sweep's `_clubJobClaim`) is proven by the claim: `startClubJobRun` starts the run only on the club's `foundation_club_jobs` row of that key under the exact lease the sweep set, so a forged claim is skipped. A job without a claim (a per-club schedule of the old setup) goes through `verifyScheduledJobScope`. Without this, the guard would have refused every sweep-run job once an operator retires the per-club schedules (they are deleted, so no registration is left).
- `foundation:dispatch-sweep` keeps `main`'s system path (null scope → `sweepAllDispatches`, which trusts no club scope and narrows to each club itself); its per-club path keeps `verifyScheduledJobScope`.
- `people:retention-sweep` (new on `main`, #471) is the 20th scheduled worker and takes the same `clubJobWorker` shape.

Results after the merge:
- `yarn install`, `yarn generate`, `yarn typecheck` — clean.
- Every other `yarn verify` step run one by one (typecheck:packages, typecheck:qa, lint, secrets, format, ds, i18n --strict, contracts, route-isolation, settings-prefixes, glossary, qa-texts, di-commands, forbidden-packages, lessons, spec-changelogs, dockerfiles, test: 1963 passed, test:scripts) — all exit 0; `build` is covered by the integration runs' production build.
- `yarn test:integration:vereino --filter TEST-G06` — 1 passed (54.3s); `--filter ISSUE-629-club-job-sweep` — 1 passed (1.0m); `--filter ISSUE-629-retire-club-schedules` — 1 passed (1.3m); `--filter TEST-M02` — 1 passed (1.0m).
- `yarn guard` (against `8bb6e6d5`) — no blocking findings.
