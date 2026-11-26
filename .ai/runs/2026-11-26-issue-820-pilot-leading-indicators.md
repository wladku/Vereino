# Run — #820 E27-S03 pilot leading indicators next to the declaration share

- **Goal and trigger:** Cezar run (task 4f2cd3da) of `om-auto-fix-issue 820`, queued by the `cezar` label after E27-S01 (#818) merged. Extend the E27-S01 report with four leading indicators per section: accounts, attendance recorded within 24 h, paid on time, covered before start.
- **Issue / spec / branch:** #820 (epic #816); design authority the issue body with the owner decision of 2026-11-26 (four indicators, counts and shares only, the E27-S01 permission and scope), no per-story spec (ready under `om-backlog`). Branch `feat/issue-820-pilot-leading-indicators`.

## Steps

1. Claim: assignee, `in-progress`, `🤖` claim comment naming the run, the worktree and the branch.
2. Data sources mapped. The attendance list's closing time is stored nowhere (`status` → `done`, `updated_at` moves with later edits; the `completed` event is not persisted). The run first stopped, released the lock and posted the options on the issue (comment 7198002994): a `completed_at` migration, the action log, or `updated_at`.
3. The user then asked the run to continue autonomously without questions. A migration is Ask First and the issue's risk note says "no migration", so the run took the no-migration option: the closing time comes from `updated_at` when that is by the deadline (a `done` session last changed by then was closed by then), else from the first check-off entry with `completed` in the action log (`actionLogService.list`, which decrypts the context), else from `updated_at`.
4. Pure rules `activities/lib/pilot-indicators.ts` and `payments/lib/paid-on-time.ts`, unit tests at 100 %.
5. `foundation` `activeAccountUserIds` (bulk read of the platform users' account state, exported from `@/modules/foundation`); `payments.paidOnTime` DI service (optional, `hasRegistration`); `activities/services/pilot-indicators.ts`; the route answers `indicators` per item and `paymentsEnabled`; the page shows a second table "Leading indicators"; en/pl catalog keys; module READMEs.
6. E27-S01 test: the academy row's `toEqual` now allows the added `indicators`.
7. Integration test `E27-S03-pilot-leading-indicators.spec.ts` with the issue's numbers.

## Decisions

- **Close time without a migration** (step 3). Known limit: a session closed before the audit log existed and changed after its deadline reads as late.
- **Accounts "at the end of the period"**: the account state is never stored, so a past period sees today's state, limited to users created before the end of the counting day. The counting day is the period's last day, or today while the period runs.
- **Attendance denominator**: ended, not cancelled sessions dated in the period; an open list counts as late only once its 24 h passed (an open list within its 24 h cannot be late yet).
- **Paid on time**: payments dated on or before the due date, reversals included, overpayments never; a cancelled charge or one with nothing to pay is left out; a charge not yet due counts only once paid on time. `fee` charges reach their section through their fee's group or activity, `order` charges through their campaign.
- **Covered before start**: started, not cancelled sessions with `absence_reported` before the start; covered when the last entry before the start brings a coach. A cancelled session is not counted (it was not held).
- **`payments` disabled** (negative case): the service is absent, `paymentsEnabled` false, `paidOnTime` null and the column hidden — unit-tested through `showsPaidOnTime`; the integration runtime always enables `payments`.
- **Contract**: additive fields on an existing response (`indicators`, `paymentsEnabled`) and a new optional DI token; no new route, so no new isolation probe.

## Files changed

- `packages/app/src/modules/activities/lib/pilot-indicators.ts`, `lib/__tests__/pilot-indicators.test.ts`, `services/pilot-indicators.ts`, `api/reports/declaration-share/route.ts`, `components/DeclarationShareReport.tsx`, `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/src/modules/payments/lib/paid-on-time.ts`, `lib/__tests__/paid-on-time.test.ts`, `services/paid-on-time.ts`, `di.ts`, `README.md`
- `packages/app/src/modules/foundation/services/accounts.ts`, `index.ts`
- `packages/app/.ai/qa/tests/activities/E27-S03-pilot-leading-indicators.spec.ts`, `E27-S01-declaration-share-report.spec.ts`

## Commands and results

- `yarn jest …/pilot-indicators.test.ts …/paid-on-time.test.ts --coverage` — 23 passed; first coverage 97.77 % branches on `pilot-indicators.ts` (line 83, a later `completed` entry); one more case, then 100/100/100/100 for both files.
- `yarn typecheck` — first run failed on `paid-on-time.ts`: `Loaded<Charge, …>[]` is not assignable to `readonly Charge[]` (partial `fields` load); the helper now takes `{ sourceType, sourceId }`; then clean (after `yarn generate` in the fresh worktree).
- eslint on the changed files — clean.
- `yarn test:integration:vereino --filter E27-S03` — 1 passed (57.8 s) on the first run.
- `yarn test:integration:vereino --filter E27-S01` — 1 passed (1.0 min) with the relaxed row assertion.
- `yarn verify` — first run failed at `lint` with no finding: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (the ESLint process at about 4 GB). Rerun with `NODE_OPTIONS=--max-old-space-size=8192` after the review fix below: lint passed; `glossary:check` failed — `activities.reports.pilotIndicators.noEndedSessions` "uses the retired term /zaję(?:cia|ć|…)/ ("Brak zakończonych zajęć")"; now "Brak zakończonych terminów"; `yarn verify --from glossary:check` passed, then one full `yarn verify` run: all 23 steps passed.
- `yarn test:integration:vereino --filter E27-S03` after the review fix — 1 passed (59.4 s).
- `yarn guard` — no blocking findings.

## Independent review (subagent, fresh read of the diff)

- No blocking findings.
- Fixed: the action-log read for a session changed after its deadline could page through every later entry (up to 5 pages of 200, one call per session over a 12-month period); it now reads one page of the entries up to the deadline only (`before`), which is all the on-time verdict needs.
- Not changed: (1) "an undone check-off still counts as closed" is correct — the check-off undo never reopens a closed list (`commands/check-off.ts`); (2) one roster read per group (8 at a time), bounded by the club's groups, acceptable for pilot sizes; (3) the paid-on-time charge query reads the club's `fee`/`order` charges due in the period and drops those outside the caller's sections in memory — counts only leave, nothing leaks; (4) `payments` imports the reader type from `activities` (type only, the consumer owns the contract, as `club_core`'s public-block provider does); (5) a future substitution kind would need `coveredBeforeStart` revisited.

## Lesson

- Added `.ai/lessons/session-close-time-not-stored.md`: the attendance list's closing time is not stored; read it from `updated_at` and the check-off action log up to the deadline.

## Open problems / next steps

- If the owner prefers an exact closing time, a `completed_at` column on `activities_occurrences` (migration, Ask First) replaces the action-log read (options in the issue comment of 2026-11-26).
- The ESLint step needs more than the default ~4 GB heap on this server when other jobs run; the gate passed with `NODE_OPTIONS=--max-old-space-size=8192`.

## Follow-up run — CI gate red on PR #838 (om-auto-fix-pr, 2026-11-26)

- **Trigger:** the required `gate` check failed (run 45865053350). Log: `[verify] failed at lint` after `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` in `@vereino/app` `eslint .` (no rule findings). `main` passes the same step at 191 s, just under the default ~4 GB heap; the same OOM also failed the gate of `feat/issue-713-enterprise-overlay` (run 45860726154), so this is repository growth, not this PR's code.
- **Fix:** `packages/app/package.json` `lint` runs `cross-env NODE_OPTIONS=--max-old-space-size=8192 eslint .`, the same heap `build` and `typecheck` already use. No rule, threshold or file list changed.
- **Base:** `origin/main` had not advanced past the PR's base (`cc3de13d`); nothing to merge.
- **Checks:** `yarn workspace @vereino/app lint` — 0 errors, 166 warnings, exit 0; `yarn verify --from lint` — all 19 steps passed (lint 86 s, build 62 s). The integration tests of this PR (E27-S01, E27-S03) passed locally earlier (above); the heap change does not touch app code.
