---
title: "moduleConfigService.getValue answers from the cache; read the row when the database is the truth"
modules: ["foundation", "configs"]
areas: ["module-data"]
topics: ["module-config", "cache", "deploy"]
---

# moduleConfigService.getValue answers from the cache; read the row when the database is the truth

**Context**: The pre-deploy ACL-sync wrapper (#673, DD-M11) stored its fingerprint with `moduleConfigService.setValue` and read it back with `getValue`. TEST-M10 changed the stored row with SQL, as a database restore or a by-hand fix would, and the wrapper still saw the old hash and skipped a sync that was due.

**Problem**: `getValue` (`@open-mercato/core` `configs/lib/module-config-service`) returns a cached record (including a cached "not found") when one exists and only reads `module_configs` on a miss; `setValue` refreshes the cache, but nothing refreshes it when the row changes outside the service. With `CACHE_STRATEGY=redis` the stale value outlives process restarts.

**Rule**: When a decision must follow the database (deploy gates, restores, integration tests that edit rows), read `module_configs` directly through a query in the module's `data/queries.ts` (foundation `readInstanceModuleConfigValue`) and keep `setValue` for writes. Use `getValue` only for values that are written exclusively through the service.

**Applies to**: `packages/app/src/modules/foundation/cli.ts` (`sync-role-acls-if-changed`), any module reading `moduleConfigService` values that operators or tests may change in SQL.
