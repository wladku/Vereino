# Run: issue #493 — Today and the calendar on the phone follow the mockup (E20-S14)

- **Trigger:** Cezar run (label `cezar` on #493), skill `om-auto-fix-issue` with the repo-local override; draft PR, an independent reviewer marks it ready (owner decision 2026-11-20).
- **Issue / epic:** #493 (E20-S14), epic #479 (UX audit of 2026-11-20). Depends on #483 (E20-S04), merged in #501.
- **Branch:** `feat/issue-493-today-calendar-phone-mockup`; worktree under `.ai/cezar/worktrees/`.
- **Spec:** `.ai/specs/2026-10-20-vereino-club-management.md` (changelog file `2026-11-21-issue-493-today-three-tiles-calendar-upcoming.md`); design authority `docs/ux-concept/` (README M-02, M-03; references R01.5, R01.7, R06.1; tokens.md).

## Goal

M-02 Today: at most three tiles in the mockup's order (Calendar → Attendance → Messages) under a club header with logo and name; sessions as rows with a line, no card inside a card. M-03 Calendar: the upcoming list as the default, week/month as tabs, one set of navigation controls ("Następny tydzień" once).

## Steps

1. Claimed #493 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read the issue, epic decisions, the mockup (`docs/ux-concept/mockups/app.ts` `screenToday`, `screenCalendar`), R01.5/R01.7/R06.1 and the current pages and widgets.
3. `people`: `GET /api/people/me` gains the additive `club.name` (the platform organization's name, via `club_core`'s `organizationName`); `ClubTodayPage` renders the club header, one tile grid for the spot `vereino:club:today:sections`, a "Shortcuts" list of rows (Payments, the new spot `vereino:club:today:more`, Profile) and the wards as rows.
4. `activities` Today widget: two tiles straight into the grid — Calendar (member sessions + the coach's "My sessions today and tomorrow" as its second part) and Attendance (coordinator section counts, coach unsettled sessions, guardian's waiting decisions, or "Nothing is waiting for your decision"); session rows with `border-b`.
5. `communication` messages widget: one tile in the grid (no own grid wrapper).
6. `payments` order and coach-payments widgets: rows (`<li>`) on `vereino:club:today:more`.
7. `activities` calendar: `lib/member-calendar.ts` gains the `upcoming` view (today + 13 days, moves by 14 days) with unit tests; the page defaults to it, hides the arrows on it, shows previous/next as 44 px icon buttons with full accessible names in one row, and drops the empty state's second "Next week".
8. Tests: new `people/ISSUE-493-today-and-calendar-phone.spec.ts`; `E06-S18` and the `showCalendarWeekOf` fixture follow the new default view.
9. Docs: UX concept README M-02/M-03 and the tokens.md inconsistency note.

## Decisions

- **What counts as a tile.** The three tiles are Calendar, Attendance and Messages (the issue's mockup order). Payments, kit orders, coach payments, the profile and the wards stay on Today as rows of lists under the tiles instead of being dropped: no data is lost (issue: "out of scope: new tiles or data") and the existing test ids keep working.
- **Staff tiles.** The coach's sessions join the Calendar tile and the coordinator's counts join the Attendance tile, so the staff context also stays within three tiles (AC 3). Test ids `club-tile-coach`, `club-tile-section`, `club-tile-calendar`, `club-tile-attendance` now mark those parts, with the same show/hide rules as before.
- **Attendance tile always shown**, with the mockup's "Nothing is waiting for your decision." (the mockup shows it always).
- **Club name.** The shell header falls back to "Klub" without a short name; Today's header uses the organization's full name (R06.1: name as text next to the logo), added to `/api/people/me` as an additive field.
- **Upcoming list without arrows.** It always starts today; Week and Month are for browsing. A linked range (`?from=&to=`) keeps the arrows.
- **New spot `vereino:club:today:more`** (additive, Vereino-owned) so `people` still imports no `payments` code.

## Commands and results

- `yarn generate` — ok; `yarn typecheck` — 0; `yarn lint` — 0 errors (pre-existing warnings only).
- `npx jest src/modules/activities/lib/__tests__/member-calendar.test.ts` — 11 passed.
- `typecheck:qa`, `contracts:check`, `glossary:check`, `qa-texts:check`, `ds:check`, `spec-changelogs:check`, `i18n:check-hardcoded --strict` — all 0 (early feedback; the gate is `yarn verify`).
- `yarn test:integration:vereino --filter ISSUE-493` — 1 passed (1.1 min).
- Integration, all local and green (`yarn test:integration:vereino [--no-build] --filter <ID>`): ISSUE-493 (twice, the second after the header change, with screenshots), E06-S18, E06-S19, E09-S05, TEST-014, TEST-A16, ISSUE-140, J-002, E03-S04, TEST-489, E07-S04, J-001, ISSUE-481, TEST-C12, E02-S03 (7), ISSUE-483, TEST-N16, TEST-C13, E06-S15, E06-S13, TEST-A10, TEST-A19, TEST-T13, TEST-N15, TEST-M10, E06-S16.
- E06-S16 failed once: `expect(locator).toBeVisible() failed … element(s) not found` at `calendarTile.getByRole('link', { name: openCalendar })` — the link moved into the Calendar tile's header, outside the `club-tile-calendar` part; the test now scopes it to `club-today-calendar-tile` and passes.
- `yarn verify` failed once at `lint`: `React Hook "useLocale" may be executed more than once` in the new spec (a Playwright helper named `use*`); renamed to `switchLocale`. Final full `yarn verify`: all 18 steps passed.
- Lesson: `.ai/lessons/injection-spot-widgets-share-the-host-layout.md`.

## Open problems / next steps

- The mockup (`docs/ux-concept/mockups/app.ts`) still renders four tiles on M-02 and the week as M-03's default; the README describes the new behaviour. Updating the clickable mockup is left to the owner's design pass.
