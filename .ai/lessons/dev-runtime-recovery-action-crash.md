---
title: "The dev banner's recovery actions crashed yarn dev; the supervisor must expose appendDiagnosticLine"
modules: ["platform"]
areas: ["debugging"]
topics: ["dev-runtime", "yarn-dev", "local-patch", "scaffold"]
---

# The dev banner's recovery actions crashed yarn dev; the supervisor must expose appendDiagnosticLine

**Context**: On 2026-11-02 `yarn dev` exited a few minutes after start with `TypeError: devRuntime.appendDiagnosticLine is not a function` (`packages/app/scripts/dev.mjs`, `runRecoveryCommand`), right after "🛠️ Applying database migrations...". The in-app dev banner had queued the `migrate` recovery action after the query indexer logged `relation "entity_index_coverage" does not exist`; the database itself was fine.

**Problem**: `dev.mjs` streams a recovery command's output into `devRuntime.appendDiagnosticLine`, but `createDevRuntimeSupervisor` (`scripts/dev-runtime-supervisor.mjs`, platform-owned scaffold) only wraps the state store's other methods; the store has `appendDiagnosticLine`, the supervisor did not forward it. Every banner action ("Apply migrations", "Regenerate") therefore killed the dev process.

**Rule**: Keep the local patch that adds `appendDiagnosticLine` to the supervisor (listed under S3.1 of the engineering standards) until the Open Mercato template ships it; on a platform upgrade, check whether `dev.mjs` calls any `devRuntime.*` method the supervisor does not return. If `yarn dev` dies after a banner action, restart it — the data is not affected.

**Applies to**: `packages/app/scripts/dev.mjs`, `packages/app/scripts/dev-runtime-supervisor.mjs`, Open Mercato upgrades.
