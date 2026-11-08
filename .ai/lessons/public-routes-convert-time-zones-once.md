---
title: "On sessionless routes, build one Intl formatter per time zone and convert each entry once"
modules: ["facilities", "activities", "club_core"]
areas: ["security", "performance"]
topics: ["public-routes", "time-zones", "rate-limit"]
---

# On sessionless routes, build one Intl formatter per time zone and convert each entry once

**Context**: The first version of the public facility month (`GET /api/facilities/public/{club}/places/{place}/schedule`, #124) checked every entry against every day of the month with helpers like `calendarDateInZone`, each of which builds a new `Intl.DateTimeFormat`. A review measured ~70 µs per construction: a pitch with ~150 entries cost ~0.7 s of blocking CPU per anonymous request. The route allows 120 requests per minute per IP and has no server cache (DD-45), so one client could saturate a core.

**Problem**: `Intl.DateTimeFormat` construction is far more expensive than formatting. Per-call helpers from `@vereino/core` are fine on a staff page that renders a handful of items. Inside a day × entry loop on a sessionless route, they multiply into an easy denial-of-service lever, and the per-IP rate limit does not prevent it.

**Rule**: On a public or otherwise unauthenticated read, keep the work linear in the number of entries:
- Cache one formatter per time zone at module level (see `localMoment` in `facilities/lib/public-schedule.ts`).
- Convert each entry to club-zone dates and minutes once (`daySpans`), group the results by date, then build the days.
- Read only the columns the response needs. Never decrypt or resolve names that the public response drops (see `publicEntries` in `facilities/services/public-schedule.ts`).

**Applies to**: Every sessionless route under `/api/*/public/…` and any month or calendar builder (`facilities`, `activities` public schedule, `club_core` public pages).
