---
title: "An integration test gets done sessions in a past month by moving planned sessions there and closing them"
modules: ["activities", "facilities"]
areas: ["testing"]
topics: ["integration-tests", "done-sessions", "reports"]
---

# An integration test gets done sessions in a past month by moving planned sessions there and closing them

**Context**: TEST-053 (#129, rented-hours report) needed 8 `done` sessions of 90 minutes in one month and one in the month before. A series cannot be created in the past, and only the check-off sets `done`.

**Problem**: Reports of past usage (rented hours, coach units, owner report) count `done` sessions. A test that waits for real time, or that only uses today's `startNow` windows, cannot place sessions in a chosen past month.

**Rule**: Create the series from today, then move each session with `PATCH /api/activities/occurrences/{id}` (as the administrator, with its version) to any past date and time, using `zoneInstant(date, 'HH:MM')`. Then close it with `saveAttendanceList(…, { entries: [], complete: true }, version)` as the session's coach. The move accepts past dates in other months, and the check-off has no end. Give each session a distinct day or time on a place, or the move answers 409. Build the period from `calendarDate()` month starts so the test works on any run date.

**Applies to**: `packages/app/.ai/qa/tests/facilities/TEST-053-rented-hours.spec.ts`; any report test over `done` sessions (`activities`, `facilities`).
