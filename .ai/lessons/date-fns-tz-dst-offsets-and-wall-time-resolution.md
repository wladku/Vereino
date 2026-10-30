---
title: "date-fns-tz offsets are wrong around DST: read them through formatInTimeZone and resolve the gap and the ambiguity yourself"
modules: ["activities", "platform"]
areas: ["architecture", "testing"]
topics: ["date-fns-tz", "time-zones", "dst", "recurrence", "rfc-5545"]
---

# date-fns-tz offsets are wrong around DST: read them through formatInTimeZone and resolve the gap and the ambiguity yourself

**Context**: Issue #31 (club spec phase 2 steps 3 and 8, 2026-10-29) built the foundation II recurrence primitive (P-24) in `@vereino/core`, which turns a club wall time such as 17:00 Europe/Warsaw into instants across both DST shifts.

**Problem**: In `date-fns-tz` 3.2, `getTimezoneOffset` returns the pre-shift offset for the first hour after the spring shift; `fromZonedTime` resolves a time in the spring gap backwards (02:30 becomes 01:30) and resolved the autumn ambiguity inconsistently between runs. A series built on them drifts by an hour around the shift days.

**Rule**: Derive the zone offset from `formatInTimeZone(instant, zone, 'xxx')` and apply RFC 5545 §3.3.5 explicitly: an ambiguous wall time takes its first occurrence, a missing one moves forward by the gap. Test both Warsaw shifts (the last Sunday of March and of October), the gap hour and the repeated hour.

**Applies to**: `packages/core/src/recurrence.ts` (`zonedInstant`) and any Vereino code that converts a club wall time to an instant.
