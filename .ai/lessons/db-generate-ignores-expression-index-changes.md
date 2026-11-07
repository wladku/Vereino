---
title: "db:generate does not diff an expression index: change the snapshot and write its migration by hand"
modules: ["payments", "platform"]
areas: ["module-data"]
topics: ["db-generate", "migrations", "snapshots", "partial-indexes"]
---

# db:generate does not diff an expression index: change the snapshot and write its migration by hand

**Context**: Issue #110 (2026-11-06) narrowed `payments_payments_reverses_unique`, a partial unique index declared with `@Index({ expression })`, so that an online payment could be refunded in parts. After the entity changed, `yarn db:generate` reported "payments: no changes".

**Problem**: The generator compares expression indexes by name only. A changed `where` clause or column list therefore produces no migration and leaves the old expression in `.snapshot-open-mercato.json`. The database keeps the old index, and the next generation still sees no difference.

**Rule**: When you change the expression of an existing `@Index({ expression })`, write the `drop index if exists` / `create unique index …` pair into the migration yourself, with the reverse pair in `down()`. Update that index's `expression` in the module snapshot by hand. Say in the migration's header comment which part is hand-written.

**Applies to**: every Vereino entity with a partial or expression index (`payments`, `activities`, `people`, …), and `packages/app/src/modules/<id>/migrations/`.
