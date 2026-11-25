---
title: "A new table with a tenant_id column joins its module's club tables list, also after merging main"
modules: ["club_core", "foundation"]
areas: ["module-data", "testing"]
topics: ["club-export", "offboarding", "migrations", "long-lived-branches"]
---

# A new table with a tenant_id column joins its module's club tables list, also after merging main

**Context**: PR #610 (#566, social sign-in) adds `vereino_identity_links` (scoped, with `tenant_id`). While it was open,
#677 (#632) merged the per-club export, deletion and restore, which refuse to run while any `tenant_id` table is not
listed (`uncoveredTables` in `club_core/lib/club-offboarding.ts`). After merging `main` into #610, every export job
failed with the generic `club_core.export.failed`, and TEST-M07 and TEST-M11 failed in CI shard 2; neither the unit
tests nor the typecheck noticed.

**Problem**: The coverage list is checked against the live database catalogue only at run time, so a branch that adds
a table compiles and passes its own tests. The export job also reports every thrown error as
`club_core.export.failed`, which hides the `club tables not covered: <table>` message in the job record.

**Rule**: A migration that creates a table with a `tenant_id` column adds that table to the owning module's
`lib/club-tables.ts` list in the same PR (`data` for club records, exported and restored), or to
`PLATFORM_CLUB_TABLES` with the right kind (`derived`, `secret`) when it is not a club record. When `main` brings in a
catalogue-driven check, re-check every table the branch adds. A failing club export in an integration test is first
checked with `club_core export-club` from the shell, which prints the uncovered table.

**Applies to**: every Vereino module's `lib/club-tables.ts`, `club_core/lib/club-offboarding.ts`, TEST-M07, TEST-M11.
