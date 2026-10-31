---
title: "Nested commandBus calls flush their side effects at once; pass transactionalEm and bulkImport, emit after the commit"
modules: ["people", "platform"]
areas: ["architecture"]
topics: ["commands", "transactions", "events", "indexing", "optimistic-lock"]
---

# Nested commandBus calls flush their side effects at once; pass transactionalEm and bulkImport, emit after the commit

**Context**: Issue #28 (2026-10-30) commits an import by running the existing person and guardianship commands for every row inside one transaction.

**Problem**: A nested `commandBus.execute` emits its events and index updates as soon as it finishes, even inside an outer transaction, so a later failure would leave events for rows that were rolled back. The nested context also carried the outer request, whose optimistic-lock header was then compared against each person.

**Rule**: Pass `transactionalEm` and `bulkImport: { skipEvents, skipReindex }` to the nested commands, drop `request` from their context, and emit the events and index updates yourself after the outer commit. Since `authorizeScoped` requires a lock token (2026-10-31, S5.2), a nested update must carry the version the outer command read as `expectedUpdatedAt` in its input (the import passes each matched person's `updatedAt` from its plan), or it answers 400 `lock_token_required`.

**Applies to**: any Vereino command that composes other commands atomically (the import, later bulk moves).
