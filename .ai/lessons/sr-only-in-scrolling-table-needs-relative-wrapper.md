---
title: "An sr-only label inside a horizontally scrolling table escapes it unless the scroll wrapper is relative"
modules: ["payments", "platform"]
areas: ["backend-ui", "testing"]
topics: ["reflow", "accessibility", "tables", "overflow"]
---

# An sr-only label inside a horizontally scrolling table escapes it unless the scroll wrapper is relative

**Context**: E07-S02 (#109, 2026-11-06): the B-22 payments table sat in an `overflow-x-auto` wrapper, yet `expectNoPageOverflow` reported the page 218 px wider than 320 px. Adding `min-w-0` changed nothing. A diagnostic that listed the elements past the viewport's right edge showed the table scrolling correctly inside its wrapper and one `SPAN.sr-only` (the hidden "Actions" header) at right = 538.

**Problem**: `sr-only` is `position: absolute`. Its containing block is the nearest positioned ancestor, not the scroll container. A static `overflow-x-auto` wrapper therefore does not clip it, and the span widens the document at the table's natural width.

**Rule**: Give the scroll wrapper of a hand-built `Table` `relative` as well as `overflow-x-auto max-w-full min-w-0`, whenever any cell holds an `sr-only` or other absolutely positioned element. When the reflow check fails, log the elements whose `getBoundingClientRect().right` exceeds the viewport instead of guessing.

**Applies to**: admin pages that use the `@open-mercato/ui` `Table` primitive directly (not `DataTable`), `packages/app/.ai/qa/tests/_fixtures/axe.ts` `expectNoPageOverflow`.
