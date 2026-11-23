---
title: "A UI hint that names a panel path builds it from the menu's own labels"
modules: ["facilities", "platform"]
areas: ["backend-ui", "testing"]
topics: ["menu-path", "i18n-placeholder", "stale-hint"]
---

# A UI hint that names a panel path builds it from the menu's own labels

**Context**: The member page `/club/places/maintenance` refused with "… in the panel: Facilities → Maintenance → Maintainers". The navigation rework (#513, D-031) renamed the group to "Facility" and moved maintenance under "Log and incidents", but the hint was a literal inside one catalog string, so nothing failed and it went stale (#667).

**Problem**: A menu path written as text inside a catalog value is invisible to every check: renaming a `pageGroupKey`, `pageTitleKey` or tab label updates the menu and leaves the hint naming a path that no longer exists, in every locale.

**Rule**: Write the path as a `{path}` placeholder and fill it in the component from the keys the menu itself renders — `pageGroupKey` and `pageTitleKey` imported from the target page's `page.meta.ts`, then the tab label keys — joined with ` › ` (`facilities/components/club-places/MaintenanceList.tsx`, `MAINTAINERS_PANEL_PATH_KEYS`). An integration test that asserts the hint fills `{path}` from the same keys with `uiTextIn`.

**Applies to**: every i18n hint that tells the user where to click in the panel ("in the panel: …", "w panelu: …"); `packages/app/src/modules/*/i18n/*.json`.
