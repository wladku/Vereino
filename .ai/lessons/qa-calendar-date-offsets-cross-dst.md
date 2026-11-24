---
title: "Compare test dates built the same way: calendarDate(n) is not addDays(calendarDate(), n) across DST"
modules: ["groups"]
areas: ["testing"]
topics: ["integration-tests", "dates", "dst"]
---

# Compare test dates built the same way: calendarDate(n) is not addDays(calendarDate(), n) across DST

**Context**: TEST-L21 failed in CI on PR #506 (run 44825803919, 2026-11-20 ~22:20 UTC): Kuba's Żaki membership came back
with `validFrom` 2026-10-21 where the spec expected 2026-10-22. The attendance fixture (`familyFor`) seeds it with
`addDays(calendarDate(), -30)` (calendar days), while the spec computed `since = calendarDate(-30)`, which subtracts
30 × 24 h of milliseconds before formatting in Europe/Warsaw. From 22:00 to 23:00 UTC in winter that instant lands
after midnight in summer time (CEST) one month earlier, one day later than the calendar answer. The unfixed spec failed
locally in that hour with the same diff; with `addDays(today, n)` it passed.

**Problem**: `calendarDate(offsetDays)` (`_fixtures/club.ts`) is millisecond arithmetic, so any offset spanning a DST change
is one day off during one hour of the evening. A spec that mixes it with a fixture's `addDays` is a time-of-day flake that
passes on every daytime run.

**Rule**: In integration tests take today once (`const today = calendarDate()`) and derive every other date with
`addDays(today, n)` (`_fixtures/activities.ts`), the same way the fixtures do. Never compare a `calendarDate(n)` with
`n ≠ 0` against a date a fixture built with `addDays`.

**Applies to**: `packages/app/.ai/qa/tests/**` — every spec that calls `calendarDate(<non-zero>)`; TEST-L21 fixed in #506.
