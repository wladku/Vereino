---
title: "A page's \"today\" is the club-zone date from useClubToday, never the browser's local date"
modules: ["activities", "club_core", "facilities", "groups", "payments", "people"]
areas: ["backend-ui", "testing"]
topics: ["time", "time-zone", "calendar-date", "flaky", "integration-tests"]
---

# A page's "today" is the club-zone date from useClubToday, never the browser's local date

**Context**: #231. Between 23:00 and 24:00 UTC, the CI runner's local date (UTC) was a day behind Warsaw's. `E06-S02` then showed a membership that starts today as `upcoming`, and `TEST-043` dated a cash receipt the day before the club's "today" list. Six modules each had their own `localToday()` built from `new Date()` getters, and pages compared the club's calendar dates with it.

**Problem**: The server decides with the club zone (`calendarDateInZone(now, settings.timezone)`), so any client date built from the browser clock disagrees with it for part of the day. That covers form defaults, `max` limits, status badges and monthly periods. A test that passes at 22:30 UTC fails at 23:04 UTC, on a PR that changed nothing nearby.

**Rule**: In a component, take today from `useClubToday()` in `@vereino/ui` (`monthOf(today)` for a month). It is computed at the component's first render, so `CrudForm` `initialValues` stay stable. For a value needed at click time or for a live `max`, use `clubToday(new Date(), useClubTimeZone())`. The backend layout provides the zone (`ClubTimeZone`, from `clubCoreSettings`), and the `/club` frames provide the profile's `club.timezone` (`ActivitiesClubFrame`, `PaymentsClubFrame`). A new member frame that reads the profile wraps its body the same way. Never add a module-local `localToday()`. To make a browser test catch this class of bug, pin a browser zone far from the club's with `test.use({ timezoneId: … })`: `Pacific/Pago_Pago` is 12 hours behind, `Pacific/Kiritimati` 13 hours ahead.

**Applies to**: `packages/ui/src/admin/club-today*.ts(x)`, `packages/app/src/app/(backend)/backend/layout.tsx`, `packages/app/src/components/ClubTimeZone.tsx`, every module's `components/**` that proposes or compares a calendar date.
