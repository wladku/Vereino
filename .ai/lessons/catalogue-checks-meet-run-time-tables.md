---
title: "A catalogue-driven check must know the tables the platform creates at run time"
modules: ["club_core", "search"]
areas: ["module-data", "testing"]
topics: ["information-schema", "pgvector", "integration-tests", "fresh-database"]
---

# A catalogue-driven check must know the tables the platform creates at run time

**Context**: PR #677 (#632) made `club_core export-club` and `delete-club` refuse while any table with a `tenant_id`
column is not covered by a list. TEST-M07 and CI passed. The owner's manual QA on a copy of the sandbox data then
failed at once: `club tables not covered: vector_search`. The `@open-mercato/search` pgvector driver creates
`vector_search` (with `tenant_id`) on first use (`CREATE TABLE IF NOT EXISTS`), not by a migration. CI and the
integration runner start from a freshly migrated database, which never has it; the sandbox, staging and production do.

**Problem**: A check that reads `information_schema` sees a different schema on a fresh test database than on a
running instance. A table missing from CI hides the gap, and a table listed as required fails on fresh databases.

**Rule**: When code enumerates tables from the catalogue, search installed packages for run-time DDL
(`grep -rliE "create table" node_modules/@open-mercato/*/dist`, excluding `migrations/`) and list each run-time table
as optional: covered when present, never reported missing when absent (`ClubTable.optional`, `presentTables`). The
integration test creates the run-time table when absent, seeds rows for each club or tenant, and drops the table
again if it created it, so CI exercises the running-instance schema.

**Applies to**: `club_core/lib/club-offboarding.ts` (`PLATFORM_CLUB_TABLES`), any coverage or isolation check over
`information_schema` (`ISSUE-628` cross-club isolation, catalogue tests), and upgrades of `@open-mercato/search` or
other packages that add run-time tables.
