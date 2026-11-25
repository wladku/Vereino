# Run: issue #277 — staff tap a free hour and save a rental, a group event or a club booking from one slot dialog (E11-S03)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 277`, issue labelled `cezar`). Build phase 3 of the facilities
  parity spec: the slot dialog on B-23 and B-24 and the renter search.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` phase 3 (REQ-R02; TEST-R04, TEST-R05;
  AC-R02); #277 (epic #253, depends on #276, merged); `feat/issue-277-staff-slot-dialog-booking`.
- **Approval:** the spec is `Ready for implementation`; the issue's Ask First items — `clubCoreDirectory.searchInstitutions`,
  the new `GET /api/facilities/renters` route and the labelled `conflicts[]` — are item (a)3 and (a)5 of the
  [owner decisions on #253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145). All additive; no
  migration, no dependency, no new module.

## Steps

1. Claimed #277 (assignee, `in-progress`, claim comment).
2. Slice (a), the renter search (commit `0e83fb9`):
   - `club_core/services/directory.ts`: `searchInstitutions(scope, query, limit)` → `{ id, name, type }[]` (live
     institutions, `ILIKE` on the name, at most 50).
   - `facilities/lib/renters.ts` (pure: term bounds, diacritic-insensitive match, 24-month window, merge of history,
     institutions and persons into at most 20 options) with `lib/__tests__/renters.test.ts`.
   - `facilities/services/renters.ts`: rentals of the caller's places in the last 24 months (500 rows, newest first,
     decrypted, `pending_verification` left out), institutions through `clubCoreDirectory`, persons through
     `people.personDirectory.searchPersonIds` + `findPersons` only with `people.view`.
   - `facilities/api/renters/route.ts`: `facilities.rentals.manage`; the place scope (`rentalPlaceIds`) is decided
     before matching; an empty scope or a foreign `placeId` → 403 `scope_denied`; `search` 2–80 → else 400
     `renter_search_invalid`; `placeId` narrows the history to the place family.
   - `services/calendar.ts`: `labelConflicts` and `staffEntryLabel`; `commands/rentals.ts` (create and move) throws the
     first issue with its conflicts labelled and placed, like the internal booking's 409.
   - TEST-R05 (`packages/app/.ai/qa/tests/facilities/TEST-R05-renter-search.spec.ts`).
3. Slice (b), the dialog:
   - `facilities/lib/slot.ts` (pure: DD-R04 kinds, closing time, default end clipped to the closing, rental end, zone
     of a minute, overlapping held requests) with `lib/__tests__/slot.test.ts`.
   - `components/slot/SlotDialog.tsx` (shell: title, zone line, "Kind" with the focus, times, the "Slot taken" list,
     the start field's issues, full-height sheet under 640 px), `RentalBody.tsx` (the former `RentalDialog` body with
     the renter search, purpose and notes), `ClubBodies.tsx` (group and general bodies from `BookDialog`),
     `slot-client.ts` (`useSlotKinds`, renter search, collision lines), `slot-types.ts`.
   - `components/rental-issues.tsx` holds `FIELD_OF_ISSUE`, `issuesByField`, `FieldIssues` (used by the move dialog);
     `RentalDialog.tsx` deleted.
   - B-23 (`FacilityCalendar.tsx`): a free hour is a button when the user has any kind; it opens the slot dialog with
     the zone, the closing time and the day's held requests. B-24 (`RentalsTable.tsx`): "New rental" opens the slot
     dialog with the rental kind and no preset slot.
   - Catalog keys `facilities.slot.*` (en, pl; texts from the mockup's `ui.slotModal.*`); six keys of the old dialog
     removed (`facilities.rentals.renterType.*`, `fields.renterType`, `actions.save`, `flash.created`).
   - TEST-R04 (`TEST-R04-slot-dialog.spec.ts`); E08-S02 follows the new dialog.
4. Spec changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-17-issue-277-phase-3.md`;
   the spec stays `Ready for implementation` (phases 4–16 open).

## Decisions

- A group event's success message counts the held requests overlapping the slot on the day's calendar: `POST
  /api/activities/events` answers before the `facilities:supersede-requests` subscriber supersedes them, and changing
  the `activities` response would be an unapproved contract change. TEST-R04 checks the message and then polls the
  request to `superseded`.
- The renter route answers `{ items, total }` (as `options/places` does); the spec names `{ items }` — `total` is
  additive.
- Persons are found through the people register's search index (words of 3+ characters); a two-character term finds
  institutions and earlier renters only.
- A caller with `facilities.rentals.manage` but neither the club-wide nor an attendant grant gets 403 (fail closed).
- The group kind is offered only with own groups (`/api/activities/events/options` lists the groups the caller
  coaches), so the club administrator who coaches nothing sees rental and general; TEST-R04 saves the group event and
  the general booking as a coach.
- M-11 (`ClubPlacePage`) keeps `BookDialog` until E11-S04 replaces it with the slot dialog (out of scope here).
- #221 L3 (browser-zone wall times) is already fixed on `main` (#315); the slot dialog reads and writes club-zone times.

## Commands and results

- `npx jest lib/__tests__/renters.test.ts --coverage` — 8 passed, `renters.ts` 100 %. `slot.test.ts` — 11 passed,
  `slot.ts` 100 %.
- `yarn generate` — ok. `yarn typecheck` — first run failed only on missing generated files (fresh worktree); after
  `yarn generate` 0 errors; later one error (`role` on `Alert`, which sets it itself) fixed. `yarn typecheck:qa` — ok.
- `npx eslint` on the changed files — 1 error (unnecessary type assertion) and 2 warnings (unnecessary `??`), fixed.
- `yarn test:integration:vereino --filter TEST-R05` — 1 passed (1.5 min).
- `--filter E08-S02` — 1 passed (1.8 min).
- `--filter TEST-R04` — run 1 failed in setup: `zone_rule_overlap` (the test's public zone used priority 3, taken by
  the bulk availability); priority 6. Run 2 failed: the zone line assertion used an exact match on "Zone: Bookable,
  paid."; loosened. Run 3 failed only on the console check: the two intended 409 refusals are logged by the browser as
  failed resources; those lines are ignored. Run 4 — 1 passed (2.1 min).
- `yarn verify` — run 1 failed at `contracts:check`: `facilities.slot.supersededN.few` and `.many` were in `pl.json`
  only; added to `en.json` (same text as `other`, as the other plural keys do). `--from contracts:check` — the 8
  remaining steps passed. Final full `yarn verify` — all 17 steps passed.
- `--filter TEST-R03` (regression for the B-23 changes) — 1 passed (2.0 min).

## Open problems / next steps

- Phases 4–16 of the spec are separate issues; E11-S04 moves M-11 to the slot dialog and removes `BookDialog`.
