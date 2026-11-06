---
title: "A directory list method is capped; never count or bill from one call — page it or count in the owning module"
modules: ["payments", "activities", "groups", "people"]
areas: ["module-data"]
topics: ["di-services", "directories", "limits", "billing", "pagination"]
---

# A directory list method is capped; never count or bill from one call — page it or count in the owning module

**Context**: Issue #108 (2026-11-05). The period generator billed per-session fees from `activities.scheduleDirectory.listOccurrences`, called once for every per-session group of the club. A review found the method returns at most 500 sessions, ordered by start, with cancelled sessions counted toward the cap.

**Problem**: The cap is silent. Above 500 sessions in the window, the later sessions are dropped, and the groups whose sessions come last are billed for fewer sessions than were held. Nothing fails and no test with a small fixture notices.

**Rule**: Treat a cross-module directory list (`listOccurrences`, `listActivities` and the like) as a page, not a total. When the result feeds money, a count or anything that must be complete:
- call it per narrow filter (one group), and
- page by its sort key until a page comes back shorter than the cap, refusing a full page that cannot advance;
- or add a dedicated count method to the owning module's directory.

Put a unit test that crosses the cap next to the reader (`payments/services/__tests__/directory.test.ts`).

**Applies to**: Any module reading another module's records through a DI directory service (`*/services/*-directory.ts`) for billing, reports, counts or exports.
