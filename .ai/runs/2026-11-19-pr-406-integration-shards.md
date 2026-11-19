# Run: PR #406 integration shards 4/6 and 5/6 (issue #311)

- **Goal and trigger:** cezar task (om-auto-fix-pr, CI focus) — the required integration check failed on shards 4/6 and 5/6 of run 44413077279; fix the failures, merge `main` in, never force-push, never merge.
- **Issue / PR / branch:** #311 / #406 / `feat/issue-311-season-rollover-preview` (worked on a detached HEAD, pushed with `git push origin HEAD:feat/issue-311-season-rollover-preview`).

## Steps

1. Read the failed job logs (`gh run view --job … --log`). Three tests failed on both attempts:
   - shard 5/6 `TEST-018` — `Expected substring: "the audit write failed"`, `Received string: "Duplicate command registration for id payments.fees.create"`.
   - shard 5/6 `TEST-L16 the wizard opens from the Seasons tab…` — `expect(locator).toBeVisible() failed … getByTestId('groups-rollover-preview') … element(s) not found` inside the `ready` callback of `scanInColorSchemes`.
   - shard 4/6 `TEST-R13` — `Expected: 201, Received: 422` on `POST /api/facilities/incidents` (line 175).
2. Merged `origin/main` (clean). `yarn di-commands:check` (new on main, #395) then reported: `src/modules/payments/commands/fees.ts registers commands and is reached from src/modules/payments/di.ts: … di.ts -> services/season-rollover.ts -> commands/fees.ts`.
3. Fix TEST-018: `payments/services/season-rollover.ts` builds its events config with `paymentsEvents<Fee>('fee')` from `commands/shared.ts` (registers nothing) instead of importing `feeEvents` from `commands/fees.ts`. `di-commands:check`: 0 problems.
4. Fix TEST-L16: `scanInColorSchemes` reloads the page for each scheme, which resets the wizard to its first step. The test now switches the scheme on the rendered page with `switchColorScheme` and scans with `scanBlockingViolations` per scheme (same `platformBaseline`, same empty-violations assertion).
5. TEST-R13: this PR changes no facilities file; `main` was green at 23:30 CET; the failure ran at 00:07 CET, right after midnight in Europe/Warsaw. The 422 code is not in the log; reading `facilities/services/today.ts`, `FacilityDialogs.tsx` and `commands/incidents.ts` showed no day-boundary bug I could name. Left unchanged; CI reruns it after the push.

## Decisions

- No change to the facilities module or TEST-R13 without a reproduced cause: the browser cannot start on this machine, and changing an unrelated test on a guess risks hiding a real defect.
- Lesson `axe-after-color-scheme-and-react-query-error-refetch` gets a fifth occurrence instead of a new record.

## Files changed

- `packages/app/src/modules/payments/services/season-rollover.ts`
- `packages/app/.ai/qa/tests/groups/TEST-L16-season-rollover.spec.ts`
- `.ai/lessons/axe-after-color-scheme-and-react-query-error-refetch.md`
- this log

## Commands and results

- `yarn typecheck`: exit 0.
- `yarn di-commands:check`: before the fix 1 problem (above), after `8 di.ts file(s), 0 problem(s)`.
- `yarn test:integration:vereino --filter TEST-018`: `1 passed (31.1s)`.
- `yarn test:integration:vereino --filter TEST-R13`: not runnable locally — `browserType.launch: … chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0` (system library missing; same as the #311 run). TEST-L16 browser test: same limitation, verified in CI only.
- `yarn verify`: `[verify] all 18 step(s) passed`.

## Open problems / next steps

- If TEST-R13 fails again in CI, read the 422 body (`incident_time_future` vs `facilities_reference_invalid`) and file a facilities issue; it is not caused by this PR.
