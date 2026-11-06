# Run — issue #121: zones, closures, rates and bulk booking availability (E08-S01)

- **Goal and trigger:** cezar task e69425fb (`om-auto-fix-issue 121`), unattended. Build facilities spec phase 5 step 2 — zones, closures, rates, the opening hours of DD-41 and the bulk booking availability of REQ-029 (TEST-041, TEST-022 in part).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (Ready for implementation, phase 5); #121 (epic #119); `feat/issue-121-zones-closures-rates-availability`.
- **Approval:** the owner's comment on #121 (2026-11-05) approves enabling the new module `facilities`, its migrations and the `club_core` migration for `club_core_places.opening_hours`. Not approved and not done: new dependencies, `yarn db:migrate` against a real database.

## Steps

1. Claimed #121 (assignee, `in-progress`, claim comment); renamed the task branch.
2. `@vereino/core` `weekly-hours.ts`: wall times, ISO weekdays, seasons `MM-DD` (wrapping the year end), `openingHoursProblem`, `openingWindowsOn`, `windowFitsOpeningHours` — framework-free because `club_core` (stores and validates) and `facilities` (checks windows) both use it. Node tests at 100 %.
3. `club_core`: `opening_hours jsonb null` on `club_core_places`, shape schema in `data/validators.ts`, rule in the place commands (422 `place_opening_hours_invalid` at the field), the list item, `effectiveOpeningHours` (nearest ancestor), `clubCorePlaces.openingHours(scope, placeIds, em?)`, and an opening-hours editor on the place form.
4. `activities`: DI service `activities.placeSessions` — `plannedSessions` (for the availability warning) and `flagForReschedule` (one conditional `UPDATE … RETURNING` in its own transaction, `activities.occurrence.updated` per flagged session).
5. `facilities` module (new, registered in `vereino-modules.json` and `src/modules.ts`): entities `ZoneRule`, `Closure`, `RentalRate`; `lib/zones.ts`, `lib/rates.ts`, `lib/closures.ts`, `lib/error-codes.ts` at 100 % unit coverage; commands `facilities.zone_rules.*`, `facilities.zone_rules.bulk_upsert`, `facilities.closures.*`, `facilities.rental_rates.*`; routes `/api/facilities/zone-rules` (+ `/bulk`), `/closures`, `/rental-rates`.
6. Migrations generated offline (`yarn db:generate` with an empty seed snapshot for the new module, an unreachable `DATABASE_URL`): `Migration20261105194801_club_core.ts` (add `opening_hours`), `Migration20261105194801_facilities.ts` (three tables). Applied by the Testcontainers database of the integration run.
7. Admin pages B-26 (`/backend/facilities/zones|closures|rates`, list + create + edit) and B-23 (`/backend/facilities/calendar`: week preview, "Set booking availability" dialog, weekly availability table with per-day "Remove") and the `facilities` i18n catalogs (en + pl, 212 keys): delegated to one subagent with disjoint files (`facilities/components/**`, `facilities/backend/**`, `facilities/i18n/**`). It reported `yarn generate`, `yarn typecheck`, `yarn ds:check` and eslint on its files green; the coordinator reviewed and integrated. Its stated choices: the client uses the browser's date for "today" (no club time-zone endpoint for the client), the dialog posts with `apiCallOrThrow` like `CancelOccurrenceDialog`, the calendar reads all of a place's rules once.
8. Integration tests: `.ai/qa/tests/facilities/TEST-041-bulk-availability.spec.ts`, `TEST-022-zones-closures-rates.spec.ts` (3 tests), `E08-S01-facilities-pages.spec.ts` (axe + 320 px reflow of all ten pages, the availability dialog, a refused 60-minute window, "Remove", the calendar at 375 px in Polish), fixture `_fixtures/facilities.ts`.
9. Fixes from the checks: lint (unnecessary assertions, number in template literals, a type parameter used once), the `MM-DD` placeholder moved to i18n, the migrations given a header, `lock_timeout` and `down()` like the existing ones; the week preview's `reservable_paid` tag moved from the platform `brand` variant (axe color-contrast 2.11:1) to `warning`; the weekly table rows got their own test id (`facilities-weekly-day-N`) instead of sharing the dialog chips' id.
10. Lessons: `core-export-star-name-collision`, `tag-brand-variant-low-contrast`.

## Decisions

- **Opening-hours model in `@vereino/core`**, not in `club_core/lib`: `facilities` may import another module only as types, and the window check is pure logic both modules need (AGENTS.md: a second consumer moves code to `core`). The names are `isoWeekdayOf`, `IsoWeekday`, `ISO_WEEKDAYS` because `recurrence.ts` already exports `weekdayOf`/`Weekday`/`WEEKDAYS` (RFC 5545 codes) — `export *` silently kept the first one.
- **Bulk "replace" splits rules** around the period (before / the overlap without the selected days / after) instead of dropping a weekday from a whole rule, so availability outside the new period survives.
- **`weekdays` on the bulk route** (optional): the days "replace" clears; a day without a window only removes its availability. This is how the per-day "Remove" of the weekly table works without a second route. Recorded in the spec's step 2.
- **Closure flags through `activities.placeSessions`** after the commit, in a transaction of its own (DD-43), so the closure response can count the flagged sessions for the toast. Rentals are counted from E08-S02 on (`rentals: 0`); the reschedule notifications of the *Events* table come with the rentals and maintenance stories. A redo (audit replay) does not flag again.
- **No occupancy lock (DD-43) yet:** step 2 adds no occupancy conflict check; zone rules and rates take their own per-organization advisory locks for the equal-priority / ambiguous-rate checks. `lockOccupancy` lands with step 3.
- **`pendingRequestsOutside` is 0** until online requests exist (E08-S05). The quote route (`/api/facilities/rentals/quote`) is E08-S02; the winter-rate rule is `quoteRate` in `lib/rates.ts`, unit-tested against the acceptance criterion.
- Read and write kinds: the club administrator only (places carry no section), like the `club_core` structure lists.

## Files changed

See the commit; areas: `packages/core/src/weekly-hours.ts` (+ test), `packages/app/src/modules/club_core/**` (opening hours), `packages/app/src/modules/activities/{data/queries.ts,di.ts,services/place-sessions.ts}`, `packages/app/src/modules/facilities/**`, `packages/app/src/modules.ts`, `packages/app/vereino-modules.json`, `packages/app/.ai/qa/tests/{facilities/**,_fixtures/facilities.ts,_fixtures/club-structure.ts}`, the spec and its changelog entry.

## Commands and results

- `yarn workspace @vereino/core test` — 98 pass, 100 % coverage.
- `npx jest src/modules/facilities src/modules/club_core/lib` — pass; `facilities/lib` 100 %.
- `yarn generate` — ok (first run surfaced a missing import in the closures route through the OpenAPI bundle: `ReferenceError: updateResponseSchema is not defined`; fixed).
- `yarn typecheck` — ok.
- `yarn verify` — first run failed at lint (`place-sessions.ts:75` unnecessary assertion; `TEST-041…spec.ts:159` number in a template literal), then at `format:check` (`OpeningHoursEditor.tsx`, formatted with plain Prettier instead of the project formatter's Tailwind plugin); after the fixes every step passed (generate, typecheck ×3, lint, format, ds, i18n strict, contracts, lessons, spec changelogs, test, test:scripts, build). The final full run after the last UI fix passed all 14 steps.
- `yarn test:integration:vereino --filter TEST-041` — 1 passed. The log carries platform `QueryIndexScopeError` lines for `directory:organization` / `auth:role` events from the fixture cleanup, unrelated to `facilities`.
- `yarn test:integration:vereino --filter TEST-022` — 3 passed.
- `yarn test:integration:vereino --filter E08-S01` — failed first on axe `color-contrast` (the `brand` tag), then on a strict-mode duplicate test id; 1 passed after both fixes.

## Open problems

- The rental half of acceptance criterion 2 ("both are marked … the toast counts them"): there are no rentals before E08-S02, so the closure reports `rentals: 0`; E08-S02 must flag rentals in the closure's post-commit step and count them.
- Acceptance criterion 5 (winter rate on a quote) is proven by the unit test of `quoteRate`; the quote route lands with E08-S02.
- `pendingRequestsOutside` is always 0 until E08-S05.
- The reschedule notifications to coordinators of flagged sessions (*Events* table, `facilities.closure.created`) are not sent yet; they belong with the rental/maintenance notices.
- The admin pages use the browser's date for "today"; a club in another time zone than the browser would see the day boundary shifted.

## Next steps

- E08-S02 (#122): rentals, the quote route on `quoteRate`, rental flags and counts in the closure, `lockOccupancy` (DD-43).
