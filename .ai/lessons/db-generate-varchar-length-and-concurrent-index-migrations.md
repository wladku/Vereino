---
title: "db:generate needs `length` for a bounded varchar, and a concurrent index gets its own non-transactional migration; TabsTrigger drops data-testid"
modules: ["club_core", "platform"]
areas: ["module-data", "testing"]
topics: ["db-generate", "migrations", "create-index-concurrently", "tabs", "playwright", "sign-in-browser"]
---

# db:generate needs `length` for a bounded varchar, and a concurrent index gets its own non-transactional migration; TabsTrigger drops data-testid

**Context**: Issue #85 (2026-11-03) added `club_core_sections.short_description` (≤ 160) and a case-insensitive unique index on live section names built `CONCURRENTLY` (UX parity spec DD-U05), and a browser test of the new section tabs.

**Problem**: (1) `@Property({ type: 'varchar(160)' })` generated `varchar(255)`: MikroORM's diff reads the length from `length`, not from the type string. (2) `yarn db:generate` emits the expression index as a plain `create unique index` in the same migration as the column; `CREATE INDEX CONCURRENTLY` cannot run inside a transaction, and MikroORM migrations are transactional by default. A failed concurrent build also leaves an invalid index that `IF NOT EXISTS` silently skips on the re-run. (3) `TabsTrigger` (`@open-mercato/ui/primitives/tabs`) does not forward `data-testid`; tab locators found nothing. (4) `signInBrowser` resets the user's password, which ends the club administrator's earlier API token (401 on the next `call`).

**Rule**: Declare a bounded varchar as `type: 'varchar', length: N`. Split a generated index into its own migration that overrides `isTransactional()` to `false` (the framework's `query_index` precedent), runs any data precondition as a `do $$ … raise exception … $$` block first, uses `set lock_timeout` (session, then `reset`), `create … concurrently if not exists`, and finally fails when `pg_index.indisvalid` is false. Keep the entity's `@Index({ expression })` so a second `db:generate` reports no changes. Prove the migration on a throwaway Postgres (precondition failure, clean run, re-run, invalid-index detection) before committing. Locate tabs with `getByRole('tab', { name })`. After `signInBrowser` for the administrator, get a new API token with `getAuthToken(request, email, password)`.

**Applies to**: `packages/app/src/modules/*/data/entities.ts`, `packages/app/src/modules/*/migrations/`, `BACKWARD_COMPATIBILITY.md` §5, `packages/app/.ai/qa/tests/**` browser tests.
