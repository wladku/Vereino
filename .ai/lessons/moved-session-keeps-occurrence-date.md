---
title: "A moved session keeps its slot date: report by the club-zone date of start_at"
modules: ["activities"]
areas: ["module-data", "testing"]
topics: ["occurrence-date", "reports", "time-zone"]
---

# A moved session keeps its slot date: report by the club-zone date of start_at

**Context**: The PZPN exports (#684) first filtered sessions by `occurrence_date` and printed it as the session's date.
TEST-O08 moves a session with `PATCH /api/activities/occurrences/{id}` (and `startNow` in `_fixtures/attendance.ts`
does the same); the move changes `start_at` / `end_at` but leaves `occurrence_date` at the series slot, so the file
would have shown a day the session did not run.

**Problem**: `occurrence_date` is the slot key of the series (generation, idempotency, rosters by slot), not the day
the session happens. A report or export that reads it misplaces every moved session, and a test that moves sessions
with `startNow` hides it only when the move stays on the same day.

**Rule**: For anything a person reads as "when it happened" (reports, exports, calendars), filter the period on
`start_at` between `zonedInstant(from, '00:00', tz)` and `zonedInstant(to + 1 day, '00:00', tz)` and print
`calendarDateInZone(start_at, tz)`. In tests, compute expected dates and times from the session's `startAt`
(`zoneDate`, `wallTime` in `_fixtures/activities.ts`), never from the day it was created on.

**Applies to**: `packages/app/src/modules/activities/services/*` reads of `Occurrence`, integration tests that call
`moveOccurrence` or `startNow`.
