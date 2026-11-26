---
title: "A read capped at N days counts club-zone days, so its millisecond check allows the hour the clocks go back"
modules: ["facilities", "platform"]
areas: ["architecture", "testing"]
topics: ["time", "time-zone", "dst", "calendar-date", "api-limits"]
---

# A read capped at N days counts club-zone days, so its millisecond check allows the hour the clocks go back

**Context**: For #784 (calendar range switch, 2026-11-26) the facility calendar B-23 got a Month view that reads a
whole month from `GET /api/facilities/calendar` (`from`/`to` as instants, at most 31 days). The cap was checked as
`to - from > 31 × 86 400 000 ms`. A month of October in Europe/Warsaw runs from 1 October 00:00 CEST to 1 November
00:00 CET: 31 days and one hour, because the clocks go back on the last Sunday of October. The month view would have
answered 400 for every October.

**Problem**: A cap written in milliseconds silently means "N × 24 hours", while every caller means "N club-zone days".
The two differ by an hour in any window that holds the autumn DST change, so the longest legal window fails once a
year and only in that month, which no test written in November notices.

**Rule**: When an API caps a window of instants at N days and its callers ask for whole club-zone days, allow one
extra hour (`calendarWindowProblem` in `facilities/lib/internal-bookings.ts` adds `DST_HOUR_MS`), or validate the
club-zone dates instead of the instants. Unit-test the cap with the October window (`2026-09-30T22:00Z` to
`2026-10-31T23:00Z`). A client must never trim the last hour of a month to fit a millisecond cap.

**Applies to**: any read that takes `from`/`to` instants with a day cap (`facilities` staff calendar; check others
before adding a month view); see also `calendar-date-offsets-are-calendar-days`.
