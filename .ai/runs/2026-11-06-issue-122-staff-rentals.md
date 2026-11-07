# Run — issue #122: staff rentals with the quote and status management (E08-S02)

- **Goal and trigger:** cezar task 0d8b4dcc (`om-auto-fix-issue 122`), unattended. Build facilities spec phase 5 step 3 — the shared occupancy lock (DD-43), staff rentals with the quote, the DD-19 charge seam, the DD-46 status table, the occupancy provider for sessions (TEST-022 rentals, TEST-023, TEST-027, TEST-058 a/b).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (In progress, phase 5); #122 (epic #119, depends on #121, merged); `feat/issue-122-staff-rentals`.
- **Approval:** the owner's comment on #119/#121 (2026-11-05) approves the `facilities_*` migrations of E08 (#121–#129). The issue's blocking open question (the occupancy race) is answered by DD-43 in the spec. Not approved and not done: new dependencies, `yarn db:migrate` against a real database.

## Steps

1. Claimed #122 (assignee, `in-progress`, claim comment); renamed the task branch.
2. `foundation`: `lockOccupancy(em, organizationId)` (advisory lock `vereino.occupancy:<org>`) exported from `@/modules/foundation`; `activities`' `lockSchedule` delegates to it, so sessions and facility entries share one lock.
3. `facilities` entities `Rental` (every spec column of `facilities_rentals`, so E08-S05 needs no migration) and `EntryBan`; `encryption.ts` (renter name, contacts, purpose, decision reason, notes, ban reason); migration `Migration20261106200238_facilities.ts` generated offline (`DATABASE_URL` pointed at an unreachable port), header and `down()` added.
4. `lib/rentals.ts` (status table, units, end, deadlines, amount, cancellation outcome, local slot, zone and opening-hours fit, occupancy conflict code, ban in force, quote) with unit tests at 100 %.
5. `services/occupancy.ts` (sessions via `activities.placeSessions`, rentals, closures on the place family; the `vereino.occupancyProvider` returns rentals and closures), `services/rental-slot.ts` (the ordered checks shared by quote, create and move), `services/charges.ts` (the optional `payments.chargeService` contract), `di.ts`.
6. Commands `facilities.rentals.create|confirm|cancel|move|no_show`, job `facilities.rentals.advance_lifecycle` (+ worker `facilities:rental-lifecycle`, `setup.ts` 15-minute schedule, CLI `facilities rental-lifecycle [--now]`), `facilities.entry_bans.create`; closures take the occupancy lock and flag rentals (`flagged.rentals`).
7. Routes `GET/POST /api/facilities/rentals`, `POST /api/facilities/rentals/quote`, `POST /api/facilities/rentals/{id}/confirm|cancel|move|no-show`, `GET/POST /api/facilities/entry-bans`; ACL `facilities.rentals.manage`, `facilities.incidents.manage`; events `facilities.rental.*`, `facilities.entry_ban.created`.
8. UI (B-24 `/backend/facilities/rentals` with tabs, actions, cancel/move dialogs; the "New rental" dialog with the live quote; rentals and "New rental" buttons on the B-23 week preview; en + pl catalogs): delegated to one subagent with disjoint files (`facilities/components/**`, `facilities/backend/**`, `facilities/i18n/**`). It reported `yarn generate`, `yarn typecheck`, eslint, `yarn ds:check`, `yarn i18n:check-hardcoded --strict`, `yarn contracts:check` and the facilities Jest suites green; the coordinator reviewed and integrated.
9. Integration tests: `TEST-022-rentals.spec.ts` (AC 1–3 + quote + refusals; TEST-058 a), `TEST-023-rental-status.spec.ts`, `TEST-027-rental-occupancy.spec.ts` (+ TEST-058 b), `E08-S02-rental-pages.spec.ts` (B-24, B-23 dialog, AC 5); fixture helpers in `_fixtures/facilities.ts`.

## Decisions

- **Payment deadline default:** start − 3 days, never before the entry. The management agreement that names N (`club_core_contracts`, `facility_management`) is not built and the pilot club's rules are open (Q04, D30); the default is one constant in `lib/rentals.ts`.
- **Entry bans ahead of E08-S06:** the acceptance criterion `entry_ban_active` needs bans, so this story adds the table, the check and a create/list route (`facilities.incidents.manage`); revocation, the incident link and the pages stay with #126.
- **DD-19 charge seam:** `payments` does not register `payments.chargeService` yet, so rentals carry their amount and staff confirm by hand; the seam is called inside the rental's transaction when registered. `payeeInstitutionId` is null until `club_core`'s directory exposes the place owner. The `payments.payment.recorded` subscriber (`confirm_paid`) waits for the service.
- **Rental commands are not undoable:** the status only moves forward (DD-46); a wrong entry is cancelled.
- **Occupancy for a rental** covers the place, its ancestors and descendants (sessions, rentals, closures); a closure or a slot outside the opening hours answers `place_closed` before the zone check; the move ignores the rental itself and keeps the amount (a missing rate does not block a move).
- **The provider now feeds closures to sessions too** (DD-20 reason `closure`): a new session in a closure answers 409.
- **Unpaid "to clarify" list** of the lifecycle job waits for the management agreement.

## Files changed

See the commit; areas: `packages/app/src/modules/foundation/{index.ts,services/occupancy.ts}`, `packages/app/src/modules/activities/data/queries.ts`, `packages/app/src/modules/facilities/**`, `packages/app/.ai/qa/tests/{facilities/**,_fixtures/facilities.ts}`, the spec, its changelog entry and this log.

## Commands and results

- `npx jest src/modules/facilities/lib --coverage` — 5 suites, 41 tests pass; `facilities/lib` 100 % lines, branches, functions.
- `yarn generate`, `yarn typecheck` — ok.
- `DATABASE_URL=<unreachable> yarn db:generate` — only `facilities` changed: `Migration20261106200238_facilities.ts` (two new tables).
- `yarn test:integration:vereino --filter TEST-022` — first run: 1 failed, 4 passed. The test asked for 2 units from 19:30 (ends 22:30, past the 22:00 opening hours), so the quote rightly answered `place_closed`; the 2-unit slots moved to the morning window. Rerun: 5 passed (the rental tests, TEST-058 (a) five rounds, and the three #121 TEST-022 tests unchanged).
- `--filter TEST-023` — 1 passed. `--filter TEST-027` — 2 passed (TEST-027, TEST-058 (b) five rounds).
- `--filter E08-S02` — failed twice on the test, then 1 passed: the new rental dialog has no default renter category, so the quote waited for one (the test now picks "Municipal club"); `TabsList` and `TabsTrigger` drop `data-testid`, so the test id moved to a wrapping `div` in `RentalsTable` and the Polish check selects the tablist by role (lesson `tabs-primitives-drop-data-testid`).
- `activities` regressions after `lockSchedule` delegates (DD-43): `--filter TEST-012` 2 passed, `--filter TEST-007` 3 passed.
- `yarn verify` — failed at lint (numbers in template literals in two tests; `@mikro-orm/postgresql` imported in the quote route, which the boundary rule allows only in data/commands/services); fixed (the quote's EntityManager fork moved to `services/rental-slot.ts` `quoteRentalSlot`), `yarn verify --from lint` passed all 10 remaining steps. After the tabs test-id fix: `--filter E08-S02` 1 passed, and the final full `yarn verify` passed all 14 steps.
- Platform `QueryIndexScopeError` lines for `auth:role` / `directory:organization` events from the fixture cleanup appear in the integration logs, unrelated to `facilities` (as in #121).

## Review (PR #210)

A fresh-eyes review subagent read `git diff origin/main...HEAD` (read-only). Its findings and what was done:

- **H1 (fixed):** registering the occupancy provider made every series edit re-check unchanged future sessions against closures and rentals, so a series with one session under a closure could not be renamed. Fix in `activities/lib/activities-rules.ts`: a candidate with `keepsSlot` (a stored session the edit leaves on its place and times, set in `services/series.ts`) ignores the provider's blocks but not other sessions or the coach. Unit test added; TEST-027 gained the case "rename refused before, accepted now; a time change into the closure still 409 with reason `closure`".
- **H2 (fixed):** a closure on a court did not flag a rental of the whole parent hall; rentals are now flagged on the place, its sub-places and its ancestors.
- **M2 (fixed):** a staff entry or move into the past answers 422 `rental_start_past`; a no-show before the start answers 409 `rental_not_started`. Ended `requested` rentals stay for the spec's unpaid "to clarify" list (Q04).
- **L1 (fixed):** the rental stores the requested category (a move re-quotes with it); `rate_id` names the rate applied.
- **M1 (follow-up):** the provider reads on a forked EntityManager — a second pool connection — while the caller holds the occupancy lock; with as many concurrent occupancy writes of one club as pool connections, the holder could wait for a connection. Passing the caller's EntityManager needs an optional `em` on the foundation `OccupancyContext` (a contract change, Ask First). Low likelihood (a club writes a few entries a minute).
- **After the fixes:** `npx jest` on `facilities/lib` + `activities/lib` 175 passed (100 % coverage kept); `yarn typecheck` ok; full `yarn verify` passed all 14 steps. The local integration reruns (TEST-027 with the new series case, TEST-022, TEST-023, E08-S02, TEST-007, TEST-012) could not run: the first attempt died with a Playwright worker crash (`exit code=3221225794`) during a cezar restart, the second found no container runtime (Docker Desktop engine not running; the run may not start it). They are left to the PR's CI integration jobs.
- **CI after the fixes (run 42347053872):** gate, browser-smoke, perf green; integration 156 passed, 2 failed. (1) E08-S02: at 320 px the page was 7 px too wide — the CI browser rendered Polish, whose DataTable footer line ("Wyświetlanie 1 do 2 z 2 wyników w 72ms") is longer than the English one the local run measured; the B-24 table wrapper became `relative min-w-0 max-w-full overflow-x-auto` (lesson `sr-only-in-scrolling-table-needs-relative-wrapper`) and the test now checks 320 px in Polish. (2) `activities` E06-S12 (not touched here): `startNow` moves a session to the current time (07:34 Warsaw in that run) and the calendar perspective did not show it; the session's club has no rentals or closures, so the occupancy provider adds nothing there — a time-of-day dependency of that test, reported on the PR.
- **CI after the reflow fix (run 42353152382, 5315c26):** gate, browser-smoke, perf, dependency review green; integration 157 passed, 1 failed — only `activities` E06-S12, which failed the same way that morning on unrelated PRs (#199 run 42352595701, #184 run 42352581448): its started session falls outside the calendar week on Saturdays; fixed separately by PR #218. Every test of this PR passed, including E08-S02 at 320 px in Polish and the new TEST-027 series case.
- **L2–L5 (follow-ups):** a move does not update a future charge's due date (when `payments` implements DD-19); the dialog converts wall times in the browser's zone; existing clubs get the lifecycle schedule only on a setup re-run; the week preview lists rentals of the exact place, not of its parent.

## Open problems

- `payments.chargeService` does not exist yet: no charge is created, the `payments.payment.recorded` → `facilities.rentals.confirm_paid` path is not built, and the TEST-023 assertions about charges (`cancelled`/`forfeited`, a throwing service rolling the rental back) cannot run. When `payments` implements DD-19, the place owner (payee) must be exposed by `club_core`'s directory.
- The payment deadline uses the default N = 3 days until the management agreement (`club_core_contracts`, kind `facility_management`) exists; the lifecycle's unpaid "to clarify" list and `auto_expire_unpaid` wait for it.
- Existing clubs get the `facilities:rental-lifecycle` schedule only when their module setup re-runs (`setup.ts` `seedDefaults`); new clubs get it at creation.
- Rental e-mails (summary to the renter, move/cancel notices) and the reschedule notifications are not sent: they need the `dispatch` templates of the notification stories.
- A staff rental may start in the past (nothing in the spec forbids it, e.g. recording a walk-in afterwards).
- The rental pages use the browser's time zone for dates and times, like the #121 pages.

## Next steps

- E08-S03 (#123): internal bookings join `occupancyEntries` and the provider (reason `booking`); "Book for group".
- E08-S05 (#125): online requests on the same `facilities_rentals` columns; approval through the DD-19 seam.
- E08-S06 (#126): entry-ban revocation, incident link and pages on top of `facilities_entry_bans`.
