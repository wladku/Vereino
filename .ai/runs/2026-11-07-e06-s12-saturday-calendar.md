# Run — E06-S12 sessions-list spec fails on Saturdays

- **Date:** 2026-11-07
- **Trigger:** side session started from the session driving PR #213 (lessons catalog without index rows): since about 06:00 UTC on 2026-11-07, every integration run on every branch fails `activities/E06-S12-sessions-list-perspectives.spec.ts`, and the `main` ruleset (up to date + green, one merge at a time) blocks every open PR on it.
- **Issue / PR:** none (test-only fix); failing run 42347096425 on PR #213.
- **Branch:** `fix/e06-s12-calendar-week` from `origin/main` 9020d6d, in its own worktree.

## Goal

Make the E06-S12 spec pass on every weekday without changing the product and without weakening its assertions.

## Steps

1. Read the failure in run 42347096425: `expect(locator).toBeVisible()` at line 140 for `.rbc-event` "Trening rozpoczęty", both attempts. The Playwright error context (artifact `playwright-report`) shows the coordinator calendar on `Nov 1 – 7, 2026` (Sunday–Saturday, en-US) with the status "No sessions in this period." — the calendar API returned nothing for the week.
2. Traced it:
   - `CoordinatorCalendar` opens on the week holding `now`, with `startOfWeek` in the app locale's first weekday (Sunday for `en`), and reads `GET /api/activities/calendar?from&to` for that week.
   - `readCalendar` selects sessions by `occurrenceDate` (`services/calendar.ts`), not by their start.
   - The spec created the started session for `tomorrow`, and `startNow` (`_fixtures/attendance.ts`) moves only its times to around now: the session keeps tomorrow's date.
   - On a Saturday tomorrow is the next week's Sunday, so the API leaves it out of this week. The next week would not show it either: the API would return it there, but the grid places it by its start (Saturday), outside that week. Clicking "Next" in the test therefore cannot fix it.
3. Fix: create the started session for `today`. Its date (what the API filters by) and its start after `startNow` (what the grid places it by) are then both in the week the calendar opens on, on every weekday and under either week rule (Sunday- or Monday-first). The assertions are unchanged.
4. Checked the other specs: only E06-S12 asserts the coordinator week grid (`.rbc-event` / `occurrences-calendar`). The specs on the member calendar (`/club/calendar`) that use tomorrow's sessions already go through `showCalendarWeekOf` (fixed in #67).

## Decisions

- Date the started session today instead of navigating to another week: no week view can show a session whose date and start are in different weeks, so navigation cannot fix it.
- Product unchanged: the calendar's week rule and the API's by-date selection are specified behaviour (club spec REQ-006, foundation II DD-G08/DD-G09).

## Files changed

- `packages/app/.ai/qa/tests/activities/E06-S12-sessions-list-perspectives.spec.ts`
- `.ai/runs/2026-11-07-e06-s12-saturday-calendar.md`

## Commands and results

Run locally on Saturday 2026-11-07 (about 08:30 UTC), so the real clock is the failing weekday; no faked clock was needed:

- `yarn test:integration:vereino --filter E06-S12` with the fix: `1 passed (2.4m)`.
- The same build with the spec from `origin/main` (`--no-build`): `1 failed` — `Error: expect(locator).toBeVisible() failed` / `Error: element(s) not found` at `E06-S12-sessions-list-perspectives.spec.ts:140:32`, both attempts, the same as CI run 42347096425.
- CI on PR #218: see the PR checks.

## Open problems / next steps

- A time-of-day edge stays, as before this change: `startNow` first tries a start 30 minutes ago, so a run in the first 30 minutes of the week's first day (club zone) puts the start in the previous week. It is unrelated to the weekday and not seen in CI.
