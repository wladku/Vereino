---
title: "Use minmax(0, 1fr) for a grid track that holds a horizontally scrolling child"
modules: ["platform"]
areas: ["backend-ui", "debugging"]
topics: ["css-grid", "responsive", "overflow", "mockups"]
---

# Use minmax(0, 1fr) for a grid track that holds a horizontally scrolling child

**Context**: In the UX mockup (`docs/ux-concept/mockups/styles.css`) the admin shell collapses to one column below 860 px. The sidebar nav then becomes a horizontal, `white-space: nowrap` scroller. At 768 px the single `1fr` track grew to about 2530 px while the shell stayed 721 px wide with `overflow: hidden`, so page actions and every table column except the first were invisible and could not be scrolled to. Found by the generic-look audit of 2026-10-27, fixed on `docs/mockup-audit-fixes`.

**Problem**: `1fr` means `minmax(auto, 1fr)`; its minimum is the min-content width of the items, and a `nowrap` row of links has a very wide min-content. `overflow-x: auto` on the nav does not help, because the track is sized before the scroller clips. A parent with `overflow: hidden` then hides the overflow instead of showing a scrollbar, so the bug looks like missing content rather than a layout overflow.

**Rule**: When a grid or flex track contains a child that scrolls horizontally (nav strips, tables, chips), size the track with `minmax(0, 1fr)` and give the grid item `min-width: 0`. Check every breakpoint where a multi-column grid collapses, at 768 px and 320 px, and look for elements whose right edge is beyond the viewport, not only for a page-level horizontal scrollbar.

**Applies to**: `docs/ux-concept/mockups/styles.css`; member, public and admin layouts built with CSS grid in `packages/app` and `packages/ui`.
