# Run — issue #288: a one-off group event refused outside opening hours (E11-S14), stopped on an ownership question

- **Goal and trigger:** cezar task d5a9ff40 (`om-auto-fix-issue 288`), unattended. Refuse `POST /api/activities/events` with 409 `place_closed` and `opening: [{ from, to }]` when an event with a `placeId` lies outside the place's opening windows (REQ-R19, TEST-R19, AC-R15).
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` (phase 14, DD-R15); #288 (epic #253); `feat/issue-288-group-event-outside-opening-hours` (local only, carries this log).
- **Approval:** the spec is `Ready for implementation` and the owner approved the `place_closed` narrowing on 2026-11-16 (#253). Nothing was built.

## Steps

1. Read the issue, the spec's phase 14, DD-R15, the business-rule row and the API row for `POST /api/activities/events`.
2. Checked the dependency: REQ-A08 (typed-in venue, E10-S05) is on `main` (`2ec49aa5`, #353), so the typed-in-venue case of TEST-R19 could run here.
3. Claimed #288 (assignee, `in-progress`, claim comment issuecomment-6963609904).
4. Read the code: `activities/commands/events.ts` (the command), `club_core/services/places.ts` (`clubCorePlaces.openingHours`), `@vereino/core` `openingWindowsOn` / `withinWindows`, and the facilities precedent `slotWithinOpeningHours` in `facilities/commands/internal-bookings.ts`.
5. Found the blocker: the deliverable "`activities/lib/error-codes.ts` (`place_closed`)" cannot pass the gate. `place_closed` is already declared by `facilities/lib/error-codes.ts`, and `packages/app/scripts/check-vereino-contracts.mjs` (in `yarn verify`) fails when two modules declare the same code ("error code place_closed is already declared by facilities"). `activities` cannot throw the `facilities` code either: `facilities` requires `activities`, not the other way round, and `eslint.vereino.mjs` forbids value imports from another module (S4.3).
6. Posted the question on #288 and released the claim.

## Decisions

- **Stop rather than pick.** Each way out either changes the owner-approved wire contract (a different code name), or moves ownership of an error code into `foundation` or `club_core`. Moving it into `foundation` adds a shared primitive. Moving it into `club_core` means `club_core` throws for `facilities` through DI. Shared primitives and architecture are Ask First items in `AGENTS.md`. The spec text does not cover the choice, so it belongs to the owner.

## Options put to the owner

1. **A new activities code** `event_place_closed` (409, `opening`), declared in `activities/lib/error-codes.ts`. Smallest change, and `facilities` is untouched. It differs from the name in REQ-R19, AC-R15 and the API row, so those spec texts change with a changelog file.
2. **`place_closed` moves to `foundation`** (`foundation/lib/error-codes.ts`; both modules throw `foundationErrors.throw('place_closed', …)`). The wire code stays identical for both routes. It touches the `facilities` typing (`FacilitiesErrorCode`, `throwFieldError`, issue unions) and adds a business code to the shared layer (REQ-F16).
3. **`place_closed` moves to `club_core`**, the owner of opening hours (DD-41). It is thrown through a `clubCorePlaces` method, like `place_not_bookable`. The wire code stays the same. This is the largest `facilities` refactor, because the quote returns issues and does not throw.

## Files changed

- this log

## Commands and results

- `gh issue view 288 --comments`: read as above.
- `grep place_closed`: declared once, in `facilities/lib/error-codes.ts:31`; thrown in `facilities/commands/internal-bookings.ts:156`, mapped in `commands/rentals.ts:126`, `commands/requests.ts:73,374`, `services/rental-slot.ts:150`.
- `gh issue comment 288`: claim (issuecomment-6963609904), then the stop comment (issuecomment-6963662679). `gh issue edit 288`: `in-progress` removed, assignee removed.

## Open problems

- The owner must pick the error-code ownership (options above).

## Next steps

- After the owner replies on #288, re-run `om-auto-fix-issue 288`. Build the pure check `activities/lib/opening-hours.ts`: windows from `openingWindowsOn`, inside a window checked with `withinWindows`, and a past-midnight event refused, as in `slotWithinOpeningHours`. Add its unit tests. Call it in `commands/events.ts` after `clubClock`, only when `placeId` is set. Read the hours through a new `openingHours` wrapper in `activities/services/directory.ts` over `clubCorePlaces`. Put the field message at `startsAt` in `EventForm.tsx` and in the facilities slot dialog's group-event body. Add TEST-R19, with every case and the series regeneration.
