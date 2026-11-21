---
title: "Widgets on one injection spot render as siblings, so the host owns the grid and the tile count"
modules: ["people", "activities", "communication", "payments"]
areas: ["backend-ui", "umes"]
topics: ["injection-widgets", "member-pages", "layout", "today-tiles"]
---

# Widgets on one injection spot render as siblings, so the host owns the grid and the tile count

**Context**: #493 (E20-S14) had to bring `/club` Today to at most three tiles in a fixed order (Calendar → Attendance → Messages, R01.5), but the tiles come from three modules on the spot `vereino:club:today:sections`. Each widget wrapped its tiles in its own `<section><ul class="grid">`, so the page was a stack of separate grids and no host rule could count or order the tiles. A Playwright helper named `useLocale` in the new spec also failed `yarn lint` (`react-hooks/rules-of-hooks`), because the hooks rule treats any `use*` call in a loop as a hook.

**Problem**: `InjectionSpot` renders its widgets as a plain fragment, ordered by the injection table's `priority` (high first), with no wrapper of its own. A widget that brings its own layout container breaks the host's layout. A widget that belongs elsewhere (a row, not a tile) breaks the count as soon as it shares the spot.

**Rule**: Let the host page own the layout. Put the spot inside the host's grid or list, and have each widget return only its items (`<section>` tiles for a grid, `<li>` rows for a list), never a grid of its own. Give items of a different kind their own spot (`vereino:club:today:more` holds the Today rows) instead of styling them differently on the same spot. Set the order with the injection-table priorities and assert it in a test through `locator(':scope > *')` on the host container. Never name a test or script helper `use*` unless it is a React hook.

**Applies to**: `people/components/club/ClubTodayPage.tsx`, the widgets on `vereino:club:today:sections` and `vereino:club:today:more`, and any host page that renders a spot from several modules.
