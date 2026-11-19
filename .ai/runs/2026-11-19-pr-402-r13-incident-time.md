# Run log — PR #402, TEST-R13 incident time after midnight

- **Date:** 2026-11-19
- **Trigger:** Cezar task (unattended `om-auto-fix-pr`): the required check `integration (shard 4/6)` of PR #402 failed.
- **Spec / issue / branch:** merge-throughput spec Phase 2; no issue; branch `ci/failure-ledger` (worked on a detached HEAD at `origin/ci/failure-ledger`, pushed with `git push origin HEAD:ci/failure-ledger`).

## Goal

Make shard 4/6 green by fixing the cause of its one failure, without weakening the test.

## Steps

1. Read CI run 44412303664, job 135185294811: `1 failed, 43 passed`; TEST-R13 failed twice (with retry) at `expect((await reported).status()).toBe(201)` — received 422.
2. Downloaded the `playwright-report-shard-4` artifact and read the trace's network log: `POST /api/facilities/incidents` sent `occurredAt: 2026-11-18T23:30:00.000Z` (00:30 Warsaw) at about 23:19 UTC and got 422 `incident_time_future`.
3. Root cause: TEST-R13 pins the browser clock at 00:30 of today (lesson `todays-rental-fixture-and-browser-clock`), and the incident dialog defaults its time from the browser clock (`clubTimeNow`). The server keeps the real time and allows 5 minutes of skew (`INCIDENT_CLOCK_SKEW_MS`), so a run between 00:00 and 00:25 Warsaw reports an incident in the future. The run hit 00:19. It is a time-of-run defect of the test, not of the app and not of this PR's R13 change (`safeDay('SA')`).
4. Fix: the test fills the incident time with `00:00`, which is never ahead of the server and still today. The lesson `todays-rental-fixture-and-browser-clock` now names this trap. No other test pins the browser clock (`grep clock.setFixedTime`).
5. Merged `origin/main` into the branch first (clean merge).

## Decisions

- Override the time in the test rather than unpinning the clock: the pinned clock is what makes the "too early" no-show check hour-independent.

## Files changed

- `packages/app/.ai/qa/tests/facilities/TEST-R13-attendant-on-the-phone.spec.ts`
- `.ai/lessons/todays-rental-fixture-and-browser-clock.md`
- this log

## Commands and results

- `yarn typecheck:qa`: exit 0. `yarn format:check`: 1679 files, 0 unformatted. `yarn lessons:check`: valid. `yarn qa-texts:check`: 0 problems.
- `yarn test:integration:vereino --filter TEST-R13`: not run locally — headless Chromium misses `libatk-1.0.so.0`, `libatk-bridge-2.0.so.0`, `libXcomposite.so.1` on this host (`ldd`); the PR's CI runs it.

## Open problems

- None known; CI on the pushed head is the end-to-end check.
