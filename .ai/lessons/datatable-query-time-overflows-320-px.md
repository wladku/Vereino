---
title: "Turn off the DataTable query time on a record tab that must reflow at 320 px"
modules: ["groups", "platform"]
areas: ["backend-ui", "testing", "debugging"]
topics: ["responsive", "overflow", "datatable", "ci-fonts"]
---

# Turn off the DataTable query time on a record tab that must reflow at 320 px

**Context**: PR #355 (issue #267) rebuilt the group roster tab on `DataTable`. TEST-A04's `expectNoPageOverflow` failed on CI three runs in a row with "page wider than 320 px by 16 px", but passed on Windows. A probe at a 290 px viewport, listing elements whose right edge passes the viewport and that have no clipping or scrolling ancestor, found one element: the pagination page info `Wyświetlanie 1 do 2 z 2 wyników w 326ms` (`shrink-0`, 261 px).

**Problem**: The platform `Pagination` renders the page info as `shrink-0` text, and `DataTable` appends the query time by default (`showQueryTime = true`). In Polish the line is about 260 px wide. Inside the record page's padding it fits on Windows fonts but not on the wider Linux fonts of the CI runner, so the failure only shows on CI. Table cells never cause this, because they scroll inside the table's own container.

**Rule**: On a `DataTable` that sits inside padded record tabs or cards and must reflow at 320 px, pass `showQueryTime={false}` unless the query time matters to the user. When a reflow check fails only on CI, probe locally at about 290 px (30 px tighter, to stand in for wider CI fonts) and list only elements with no non-`visible` `overflow-x` ancestor; scrolling table content is never the cause.

**Applies to**: `packages/app/src/modules/*/components/*` hosts of `DataTable`; `expectNoPageOverflow` in `packages/app/.ai/qa/tests/_fixtures/axe.ts`.
