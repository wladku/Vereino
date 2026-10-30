---
title: "Drive the platform date picker through its grid after networkidle; assert the row, not the flash, after a CrudForm redirect"
modules: ["platform", "people"]
areas: ["testing"]
topics: ["date-picker", "crudform", "playwright", "journeys"]
---

# Drive the platform date picker through its grid after networkidle; assert the row, not the flash, after a CrudForm redirect

**Context**: Epic #21 (2026-10-30) got its phase 1 exit-gate test, `journeys/J-001-club-structure-and-family.spec.ts`, the first test that drives the person create form with birth dates, the person pickers and every `club_core` create form in the UI.

**Problem**: The platform `DatePicker` has no text input, and a popover opened right after the page loads is closed again when `CrudForm` moves the focus once it has loaded. The `withFlash` success message after a create redirect is not reliably visible on the next page. Text matchers were ambiguous: "No coordinator" also matches "No coordinator assigned.", and while a person picker's result list is open a name appears twice.

**Rule**: Wait for `networkidle`, then open the picker inside `expect(...).toPass()`; move through the month-and-year grid, click `[data-day="YYYY-MM-DD"]:not([data-outside]) button` and "Apply" (the `pickDate` helper in the J-001 spec). After a create redirect assert the new row in the list, not the flash. Anchor status-text regexes (`^No coordinator$`) and scope name checks to the list items.

**Applies to**: integration tests that fill `CrudForm` date fields or `LookupSelect` pickers; move `pickDate` to a fixture when a second test needs it.
