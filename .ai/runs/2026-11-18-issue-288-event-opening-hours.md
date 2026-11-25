# Run — issue #288: a one-off group event refused outside opening hours (E11-S14)

- **Goal and trigger:** cezar task d5a9ff40 (`om-auto-fix-issue 288`), unattended. Refuse `POST /api/activities/events` with a 409 and `opening: [{ from, to }]` when an event with a `placeId` lies outside the place's opening windows (REQ-R19, TEST-R19, AC-R15).
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` (phase 14, DD-R15); #288 (epic #253); `feat/issue-288-group-event-outside-opening-hours`.
- **Approval:** the spec is `Ready for implementation`, and the owner approved the narrowing on 2026-11-16 (#253). The owner told the run in the cockpit to proceed on reasonable assumptions for the code name (below). No migration, no new dependency.

## Steps

1. Read the issue, the spec's phase 14, DD-R15, the business-rule row and the API row.
2. Checked the dependency: REQ-A08 (typed-in venue, E10-S05) is on `main` (`2ec49aa5`, #353), so the typed-in-venue case of TEST-R19 runs here.
3. Claimed #288 (issuecomment-6963609904).
4. Read `activities/commands/events.ts`, `club_core/services/places.ts` (`clubCorePlaces.openingHours`), `@vereino/core` `openingWindowsOn`, and the facilities precedent `slotWithinOpeningHours`.
5. Blocker: the spec's "`activities/lib/error-codes.ts` (`place_closed`)" cannot pass the gate. `facilities/lib/error-codes.ts` already declares `place_closed`, and `contracts:check` requires error codes unique app-wide. `activities` cannot throw the `facilities` code either: `facilities` requires `activities`, and `eslint.vereino.mjs` forbids value imports between modules. Stopped, posted three options with a recommendation (issuecomment-6963662679) and released the claim. The run log was committed as `bc6a6502`.
6. The owner answered in the cockpit: continue autonomously on reasonable assumptions. The run took the recommended option 1, re-claimed the issue and recorded the choice on it (issuecomment-6963721352).
7. Built the pure rule `activities/lib/opening-hours.ts` (`eventOutsideOpeningHours`, `openingLine`) with unit tests (7 cases).
8. Added the error code `event_place_closed` (409) with `en`/`pl` messages naming the day's hours. Added `placeOpeningHours` in `activities/services/directory.ts` over `clubCorePlaces.openingHours`. Added the check in `commands/events.ts`, after the time checks and before the schedule lock, only with a `placeId`. Updated the route's OpenAPI 409 description.
9. UI: the slot dialog's group body (`facilities/components/slot/ClubBodies.tsx`) shows the refusal at the start field, like `place_closed` for a club booking. The coach's event form (`ClubEventPage.tsx` plus the `member-event.ts` field map) and the panel event form (`client-helpers.ts` field map) put the message at the start time.
10. Spec: renamed the event code in REQ-R19's rows (business rule, diagram, compatibility, J-R03, API row, TEST-R19, phase 14, the coverage table, the BC table). Ticked AC-R15. Added changelog file `2026-11-18-issue-288-phase-14.md`. The facilities rental row (`SlotDialog`, `place_closed`) is unchanged.
11. Integration test `.ai/qa/tests/facilities/TEST-R19-event-opening-hours.spec.ts`.

## Decisions

- **`event_place_closed` instead of `place_closed`** (option 1). It is the smallest change, carries no regression risk for `facilities`, and keeps one owner per code. The dialog's message is its own either way. Moving `place_closed` to `foundation` or `club_core` would have refactored the `facilities` typing and its quote for no user-visible gain.
- **A past-midnight event never fits a place with hours**, except one that ends exactly at 24:00 in a window closing at 24:00. This matches the club booking rule (`slotWithinOpeningHours`), and an event that ends at midnight fits a window that closes then.
- **The check runs before the schedule lock.** It reads only the place's hours, so a refused event takes no lock.
- **Scope:** only the create command, as the issue says. Moving or editing a session (`occurrences` commands) is not checked; that would be a separate story.

## Files changed

- `packages/app/src/modules/activities/lib/opening-hours.ts`, `lib/__tests__/opening-hours.test.ts` (new)
- `packages/app/src/modules/activities/lib/error-codes.ts`, `i18n/en.json`, `i18n/pl.json`
- `packages/app/src/modules/activities/services/directory.ts`, `commands/events.ts`, `api/events/route.ts`
- `packages/app/src/modules/activities/lib/member-event.ts`, `lib/__tests__/member-event.test.ts`, `components/client-helpers.ts`, `components/club/ClubEventPage.tsx`
- `packages/app/src/modules/facilities/components/slot/ClubBodies.tsx`
- `packages/app/.ai/qa/tests/facilities/TEST-R19-event-opening-hours.spec.ts` (new)
- `BACKWARD_COMPATIBILITY.md` (§2 narrowed guarantee), `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md`, `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-18-issue-288-phase-14.md`
- this log

## Commands and results

- `npx jest src/modules/activities/lib/__tests__/opening-hours.test.ts`: 7 passed.
- `yarn verify`: all 17 steps passed (contracts:check: 8 modules, 271 error codes, 0 problems; unit tests at the coverage thresholds; build passed).
- `yarn test:integration:vereino --filter TEST-R19`: the first run failed with `TypeError: browserContext.addCookies: Invalid URL` (the cookie was set while the page was still on `about:blank`; every API case had already passed). Fixed by opening the day view first; the re-run gave `1 passed (2.9m)`. After the fix, `yarn format:check` (0 unformatted), `yarn typecheck:qa` and `yarn qa-texts:check` (0 problems) passed.

## Open problems

- None known.

## Next steps

- Review and merge the PR. A follow-up story could apply the same rule when a one-off event's session is moved or edited.
