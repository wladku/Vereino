# Two member-calendar integration tests fail on Sundays

- **Date:** 2026-11-01 (a Sunday)
- **Agent / tool:** Claude Code (Opus 5.5), coordinator session, no subagent
- **Trigger:** the whole-suite run of #65 (PR #66) failed E03-S04 `coach-attendance-ui` and TEST-014 `member-declaration-ui`. Both failed the same way on an untouched `main` checkout (10623e3). Owner decision: "Yes, fix them".
- **Branch:** `fix/sunday-calendar-tests`
- **Status:** completed, PR open for review

## Cause

The member calendar `/club/calendar` opens on the Monday–Sunday week of today (`calendarWeek` in `packages/core/src/calendar.ts`). It keeps its week in component state and filters sessions by `occurrence_date`.

Both tests create their sessions for "tomorrow". On a Sunday, tomorrow falls in next week, so `calendar-item` never appears. In E03-S04, `startNow` moves only the session's times; the session keeps tomorrow's date.

The product behaves as specified. The tests assumed tomorrow is in this week.

## Change

- `packages/app/.ai/qa/tests/_fixtures/activities.ts`:
  - `mondayOf(date)`;
  - `showCalendarWeekOf(page, date)`, which clicks "next week" until the calendar shows the week of `date`, waiting for the range label to change after each click. On Monday–Saturday it does nothing.
- E03-S04 calls it after choosing the coach view. TEST-014 calls it after the first navigation, after each reload and after "Try again", because a reload returns the calendar to this week.
- No product code changed, and no assertion was weakened.

## Commands and results

All runs on Sunday 2026-11-01, between 18:52 and 18:59 Europe/Warsaw:

- `yarn test:integration:vereino --filter E03-S04-coach-attendance-ui`: 1 passed (1.2 min). Before the change it failed on the same day.
- `yarn test:integration:vereino --filter TEST-014-member-declaration-ui`: 1 passed (1.3 min). Before the change it failed on the same day.
- `yarn verify`: 13/13 passed.

## Next steps

- Owner review. Until this merges, any PR whose CI runs on a Sunday fails these two tests, #66 included.
