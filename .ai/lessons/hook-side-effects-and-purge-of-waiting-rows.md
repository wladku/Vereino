---
title: "A cross-module hook that writes through nested commands hands back its after-commit side effects; a purge that keeps rows for later must sweep purged imports"
modules: ["people", "groups", "platform"]
areas: ["architecture", "module-data"]
topics: ["commands", "events", "di-hooks", "purge", "imports"]
---

# A cross-module hook that writes through nested commands hands back its after-commit side effects; a purge that keeps rows for later must sweep purged imports

**Context**: Issue #65 (2026-11-01) added the optional DI hook `groups.membershipImporter`, which the `people` import commit calls to create participant memberships inside its own transaction.

**Problem**: A nested command run with `bulkImport` suppression does not keep its events for later: `dataEngine.flushOrmEntityChanges` clears the side effects it suppresses, so the membership events were lost. Separately, the import purge selects only imports with `purged_at` null; a row kept for the hook and processed by a re-run after its import was purged would never be deleted.

**Rule**: A hook in another module that writes through nested commands returns an `emitSideEffects()` function (or equivalent), and the caller runs it after its transaction commits, next to its own deferred events. A purge that keeps rows for a later processor also sweeps the processed rows of imports it has already purged.

**Applies to**: `groups/services/membership-importer.ts`, `people/commands/imports.ts`, `people/commands/jobs.ts` and any future DI hook that writes inside another module's transaction.
