---
title: "A dashboard widget's title and description come from catalog keys named after its id, never from metadata"
modules: ["platform", "people", "payments", "facilities", "activities"]
areas: ["backend-ui", "testing"]
topics: ["dashboard", "widgets", "i18n", "check-hardcoded"]
---

# A dashboard widget's title and description come from catalog keys named after its id, never from metadata

**Context**: #484 (E20-S05, UX audit 2026-11-20): on B-01 in Polish, seven tiles of `people`, `payments` and
`facilities` showed English titles and descriptions next to translated `activities` tiles. All widgets declared the same
English literals in `metadata.title` / `metadata.description`; only the translated ones also had catalog keys.

**Problem**: the platform `DashboardScreen` (`resolveWidgetTitle` / `resolveWidgetDescription`) translates a widget only
through catalog keys derived from its id — `<id minus last part>.widgets.<last part>.title` (e.g.
`payments.dashboard.widgets.overdue.title`), then `<id>.title`, then `dashboard.widgets.<id>.title` — and otherwise shows
the literal metadata string. `i18n:check-hardcoded` scanned JSX and calls, not object properties, so nothing flagged it.

**Rule**: give every dashboard widget `<module>.dashboard.widgets.<name>.title` and `.description` in each catalog of its
module (`i18n/en.json`, `i18n/pl.json`); keep the English literal in `metadata` only as the platform fallback.
`yarn i18n:check-hardcoded --strict` (step of `yarn verify`) now fails on a missing key and names the widget file
(`packages/app/scripts/vereino-widget-titles.mjs`).

**Applies to**: `packages/app/src/modules/*/widgets/dashboard/*/widget.ts`, their module catalogs.
