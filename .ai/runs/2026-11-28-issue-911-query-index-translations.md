# Run: issue #911 — query_index logs `entity_translations does not exist` after Open Mercato 0.10.1

- **Goal and trigger:** Cezar task, `om-auto-fix-issue 911` (label `cezar`). Stop the indexer error rows and log lines that 0.10.1 produces on every query-index build.
- **Issue / branch:** #911; `docs/issue-911-query-index-translations`. Related: PR #887 (0.10.1 upgrade, open).

## Steps

1. Read the issue and the diagnosis comment on PR #887. No claim existed.
2. Read `buildIndexDoc` on `main` (`@open-mercato/core` 0.9.0): the read is already there, but an empty `catch {}` swallows its failure, so `main` has no error rows or log lines.
3. Downloaded `@open-mercato/core@0.10.1` with `npm pack` into a private temporary directory, which was deleted afterwards. In `dist/modules/query_index/lib/indexer.js` (lines 147–187) the read runs unconditionally. A failure rolls back to a savepoint, reports to telemetry and calls `recordIndexerError` (`query_index:build-index-doc:translations`). Nothing in the package skips the read.
4. Inspected the platform `translations` module: one migration that creates `entity_translations` with 4 indexes (its `catalog_product_offers` backfill is skipped when that table is missing). Its `index.js` has no `requires`, and no Vereino module declares `translations.ts`.
5. Posted the options on the issue (comment 7242714217) and asked the owner to choose.
6. The user told the session to continue without asking. Approval for an Ask First item counts only when the issue, its spec or an owner comment records it, and none does. So this run does not enable the module and does not add a migration. It records the finding as lesson `query-index-reads-entity-translations-unconditionally`.

## Decisions

- **Module not enabled:** a new module with a migration is Ask First, and no approval is recorded.
- **No Vereino-owned `entity_translations` migration:** it would duplicate a platform-owned table.
- **No upstream issue filed:** that is an outward-facing post the owner did not ask for. The option stays on #911.
- **PR refers to #911 without closing it:** the issue stays open for the decision.

## Files changed

- `.ai/lessons/query-index-reads-entity-translations-unconditionally.md` (new)
- `.ai/runs/2026-11-28-issue-911-query-index-translations.md` (this log)

## Commands and results

- `yarn lessons:check` → `Lessons catalog is valid`.
- `yarn verify` → all 24 steps passed.
- `yarn guard` → no blocking findings.

## Open problems / next steps

- Owner decision on #911: enable `translations` (inside #887 or in a follow-up PR after it merges), or report it upstream.
