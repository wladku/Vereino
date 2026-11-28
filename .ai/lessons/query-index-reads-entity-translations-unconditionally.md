---
title: "From Open Mercato 0.10.1 the query index reads entity_translations on every build; without the translations module each build logs an error"
modules: ["platform", "query_index"]
areas: ["architecture", "debugging"]
topics: ["platform-upgrade", "query-index", "translations", "indexer-errors"]
---

# From Open Mercato 0.10.1 the query index reads entity_translations on every build; without the translations module each build logs an error

**Context**: The 0.10.1 upgrade (PR #887, #498) ran the integration suite with 1,231 `relation "entity_translations" does not exist` errors in a single shard. The entities were people:person, auth:user, auth:role, directory:tenant and attachments:attachment. Issue #911 traced them.

**Problem**: `buildIndexDoc` in `@open-mercato/core/dist/modules/query_index/lib/indexer.js` reads `entity_translations` for every record it indexes. In 0.9.0 an empty `catch {}` swallowed the failure. From 0.10.1 a failure:
- rolls back to a savepoint;
- reports the error to telemetry;
- writes an indexer error row (`query_index:build-index-doc:translations`);
- logs a level-50 error with a stack trace.

The read is unconditional: no env var, module flag or DI option skips it. The table belongs to the platform `translations` module (migration `Migration20260215120000`), which this app does not enable. Indexing still works, but the indexer error log and production logs fill with noise, and every write does extra work.

**Rule**: Do not hunt for a switch to turn the read off; 0.10.1 has none. There are two supported ways out:
- enable the `translations` module, which brings its migration and is Ask First;
- get the read made conditional upstream.

Never create `entity_translations` in a Vereino migration: the platform owns the table, and a hand-made copy would clash when the module is enabled. Until a decision lands, treat `query_index:build-index-doc:translations` errors as known noise (#911), not as a regression of the change under test. After each platform upgrade, check the indexer again for reads of tables that belong to modules this app does not enable.

**Applies to**: Open Mercato upgrades (`packages/app/package.json` `@open-mercato/*`), `packages/app/src/modules.ts`, query-index error triage in CI and production logs; issue #911, PR #887.
