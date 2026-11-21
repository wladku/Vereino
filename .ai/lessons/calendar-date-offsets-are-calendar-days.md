---
title: "A day offset in a test is added to the club-zone calendar date, never to the clock as N × 24 h"
modules: ["groups", "platform"]
areas: ["testing"]
topics: ["time", "time-zone", "dst", "calendar-date", "flaky", "integration-tests"]
---

# A day offset in a test is added to the club-zone calendar date, never to the clock as N × 24 h

**Context**: On PR #512 (2026-11-20, 22:26 UTC = 23:26 in Warsaw) integration shard 4 failed TEST-L21 twice: the test expected a membership from `2026-10-22`, the API returned `2026-10-21`. The test computed `since = calendarDate(-30)` and the shared `familyFor` fixture computed the same day as `addDays(calendarDate(), -30)`. The old `calendarDate(offset)` formatted `Date.now() + offset × 86 400 000` in Europe/Warsaw. Summer time ended on 2026-10-25, between the two dates. So in the last hour before midnight, Warsaw time, "30 × 24 h ago" was already the next day, 10-22. Calendar arithmetic gave 10-21.

**Problem**: Adding hours to an instant and then reading the zone's date is not the same as adding days to the date. The two differ by one day for one hour a day whenever a DST change lies between today and the target day. The test then fails only on CI runs that start late in the evening, which makes it look flaky.

**Rule**: Compute a day offset from the club-zone date itself: take today's `YYYY-MM-DD` in the zone, then add days on a UTC date (`Date.UTC(y, m - 1, d + offset)`). `calendarDate(offset)` in `packages/app/.ai/qa/tests/_fixtures/club.ts` now does exactly this, so it agrees with `addDays(calendarDate(), offset)`. Never pass `Date.now() + n * 86_400_000` through a zoned formatter to get a calendar day. Offsets on an exact instant (`startsAt`, purge timestamps) may stay in milliseconds.

**Applies to**: integration test fixtures and specs under `packages/app/.ai/qa/tests/`; any server or UI code that derives "N days from today" in the club zone (see also `client-today-is-the-club-zone-date`, `date-fns-tz-dst-offsets-and-wall-time-resolution`).
