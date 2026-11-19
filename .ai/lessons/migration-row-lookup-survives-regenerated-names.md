---
title: "Read a migration's row by name order, never by its exact name"
modules: ["payments"]
areas: ["module-data"]
topics: ["migrations", "scheduled-jobs", "greenfield"]
---

# Read a migration's row by name order, never by its exact name

**Context**: `payments` dates the first automatic charge generation from the `executed_at` of migration B in `mikro_orm_migrations_payments` (#301, Q-C07). The first version matched the hard-coded class name `Migration20261118201338`. The review of #398 noted (#405) that a greenfield rebuild regenerates the migrations under new names: the row is then missing, the start month reads as unknown, and the automatic generation never runs, logging only a warning.

**Problem**: A migration's name is not a stable identifier across rebuilds of the migration history, so an exact-name lookup fails silently on a fresh deployment while every test on the current history passes.

**Rule**: When code reads "when did this schema change arrive" from a `mikro_orm_migrations_<module>` table, take the earliest row whose name sorts at or after the migration's name (`where name collate "C" >= ? order by executed_at limit 1`). Names start with their creation timestamp, so on an existing deployment that is the migration itself, and after a rebuild it is the first regenerated migration, which already contains the change. Prefer a stored fact (a column or setting) when the date matters per tenant.

**Applies to**: `packages/app/src/modules/payments/data/queries.ts` `automaticGenerationSince`; any future lookup of a migration row.
