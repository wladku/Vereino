# Run: #221 L3, rental wall times in the club zone

- **Goal / trigger:** cezar task `eba04089` started `om-auto-fix-issue 221` (issue labelled `cezar`, 2026-11-15). #221 collects the follow-ups from PR #210; PR #242 already fixed closure undo/redo locking, the lifecycle `updatedAt` and the dead `chargeId` check. #247 (#231) now gives the client the club time zone, so L3 can be fixed: the rental dialog read wall times in the browser's time zone.
- **Issue / branch:** #221, `fix/issue-221-rental-club-zone` (renamed from `cez/221`). No spec: a bug fix (`direct`).
- **Claim:** assignee `wladku`, `in-progress` label and a `🤖` claim comment, posted 2026-11-15.

## Steps

1. Triage: on `main` (`58b7757`) `rentals-client.ts` built instants with `new Date(`${date}T${time}`)` and labelled slots with the browser-local `instantLabel`. Callers: the new-rental dialog, the move dialog, the quote panel (end time), the rentals list and its confirm texts, the owner report, the week preview (grouping, window, block times) and the conflict labels.
2. Replaced `localDateOf` / `localTimeOf` / `localInstant` / `localDayStart` with `clubDateOf` / `clubTimeOf` / `clubInstant` / `clubDayStart` that take the zone. `slotLabel` and `conflictLabel` now take the zone too. The new conversions reuse `zonedInstant` (`@vereino/core`) and `zoneWallTime` / `timeOf` (`club-places/places-client.ts`). Removed the unused `nowLocalTime`.
3. Added `useRentalTimeZone()`: the page's club zone (`useClubTimeZone`), or the browser's while there is none or the runtime does not know it (the same fallback as `clubToday`).
4. Threaded the zone through every caller listed in step 1.
5. `E08-S02` now pins `Pacific/Honolulu` (11–12 h behind Warsaw). It asserts that the list labels a 08:00 club slot as `08:00` and that 08:00 typed in the dialog saves as 08:00 in the club zone.
6. Extended lesson `client-today-is-the-club-zone-date` to cover wall times.

## Decisions

- **Only the rental surfaces.** Other facilities screens (closures, incidents, maintenance, logs) still show instants with the browser-local `instantLabel`. Those are separate screens with their own `datetime-local` inputs; the club place page already uses `zonedLocalInstant`. They are outside L3 and can be a follow-up.
- **Helpers stay in `components/`.** `rentals-client.ts` is client code, not `lib/`, so the 100 % unit coverage rule does not apply. The integration test covers it.

## Commands and results

- `yarn typecheck`: no facilities errors (before `yarn generate` only the missing generated files failed).
- `yarn verify`: the first run failed at `format:check` (`OwnerReport.tsx is not formatted`). After `yarn format`, `yarn verify --from format:check` printed `all 9 step(s) passed`; the earlier steps (generate, typecheck ×3, lint) had passed.
- `yarn test:integration:vereino --filter E08-S02`: `1 passed (1.5m)`.

## Open on #221

M1 (Ask First: an optional `em` on the foundation `OccupancyContext`), L2 (waits on payments DD-19), L4 (generic schedule backfill), L5 (place-family filter on the rentals list), the move re-quote product question, and the `lockSchedule` key note (no code change, see PR #242).
