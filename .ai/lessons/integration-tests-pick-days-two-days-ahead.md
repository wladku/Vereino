---
title: "Integration tests act on a day at least two days ahead (safeDay), never on today or tomorrow"
modules: ["platform"]
areas: ["testing"]
topics: ["integration-tests", "time", "fixtures", "flaky", "calendar-date"]
---

# Integration tests act on a day at least two days ahead (safeDay), never on today or tomorrow

**Context**: TEST-L03 planned a weekly training on Wednesdays at 17:00 from today and declared an absence on the first session between today and the last day. On Wednesday 2026-11-18 that session was today's, declarations close at the start, and every run after 17:00 Warsaw answered 409 `declaration_closed`: main's CI at 18:16 UTC and the PRs #374, #386, #387 and #388 all went red for a test they did not touch. #390 fixed it by taking a session after today. The audit for the merge throughput spec (MT-D05, MT-TEST-04) found the same shape in TEST-R13: a rental by phone on `nextWeekday(addDays(today, 1), 'SA')` at 10:00, expected `cancelled_free`, is inside its 24-hour free-cancellation deadline on any Friday after 10:00.

**Problem**: The app reads the real clock (declaration windows, confirm-by deadlines, rental start and cancellation deadlines, attendance windows, "past" and "upcoming" lists). A date of today or tomorrow is then right or wrong depending on the hour and weekday of the run, so the test passes for days and fails on one weekday after one hour, usually on someone else's pull request. `nextWeekday(addDays(today, 1), X)` and a series `startsOn: today` both return today or tomorrow on some weekday.

**Rule**: When a test acts on a date whose outcome depends on the time of the run — declares on a session, books a slot or rental, cancels against a deadline, expects "upcoming" — pick the date with `safeDay(weekday?, minDaysAhead = 2)` from `.ai/qa/tests/_fixtures/activities.ts` (pure arithmetic: `safeDayAfter` in `packages/app/scripts/vereino-test-dates.mjs`, unit-tested at 100 % by `yarn test:scripts`). A day at least two calendar days ahead starts more than 24 hours after any moment of today. For a series that starts today, choose its sessions with `occurrenceDate >= safeDay()` (TEST-L03) or with `firstSession`/`upcoming` from `_fixtures/attendance.ts`, which compare with the current instant. Keep today or tomorrow only when the test is about them (the Today tile lists today and tomorrow; "within a day" rental helpers search the next 24 hours from `Date.now()`; today's rental is seeded by the request probe with a fixed browser clock, lesson `todays-rental-fixture-and-browser-clock`), and then check that nothing in the test compares that date with the current hour. Moving a session to "now" follows lesson `integration-tests-must-not-depend-on-the-clock`.

**Applies to**: every integration test under `packages/app/.ai/qa/tests/` that schedules declarations, sessions, bookings, rentals or deadlines; `_fixtures/activities.ts` (`safeDay`, `nextWeekday`), `_fixtures/attendance.ts` (`weeklySeries`, `oneOff`, `firstSession`).
