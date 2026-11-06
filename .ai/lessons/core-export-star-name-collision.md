---
title: "A name exported by two @vereino/core files resolves to one of them without an error; grep the index before naming an export"
modules: ["platform", "facilities"]
areas: ["architecture", "testing"]
topics: ["workspaces", "exports", "export-star", "naming", "jest"]
---

# A name exported by two @vereino/core files resolves to one of them without an error; grep the index before naming an export

**Context**: #121 added `packages/core/src/weekly-hours.ts` with `weekdayOf(date)` returning an ISO weekday (1–7). `recurrence.ts` already exported `weekdayOf(date)` returning the RFC 5545 code (`'TH'`), plus `Weekday` and `WEEKDAYS`. `src/index.ts` re-exports both files with `export *`.

**Problem**: `yarn typecheck` stayed green and the package's own node tests passed (they import the file directly). Through `@vereino/core`, Jest resolved `weekdayOf` to the recurrence version, so the app's facilities tests saw `'TH'` and `addDays(date, 1 - 'TH')` threw `RangeError: Invalid time value` far from the cause. An ambiguous `export *` name is not an error in TypeScript's module resolution for the consumer; it is silently dropped or bound to one source depending on the loader.

**Rule**: Before adding an export to `@vereino/core` (or any package whose index uses `export *`), grep `packages/core/src/*.ts` for `export .* <name>\b`; give the new name a qualifier when it is taken (`isoWeekdayOf`, `IsoWeekday`, `ISO_WEEKDAYS`). Test new core functions also through the package entry from an app test when an app module is the consumer.

**Applies to**: `packages/core/src/index.ts`, `packages/db/src/index.ts`, `packages/ui/src/index.ts` and any new shared-package file.
