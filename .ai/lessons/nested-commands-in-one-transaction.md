---
title: "Nested commandBus calls flush their side effects at once; pass transactionalEm and bulkImport, emit after the commit"
modules: ["people", "enrolment", "groups", "platform"]
areas: ["architecture"]
topics: ["commands", "transactions", "events", "indexing", "optimistic-lock", "grants"]
---

# Nested commandBus calls flush their side effects at once; pass transactionalEm and bulkImport, emit after the commit

**Context**: Issue #28 (2026-10-30) commits an import by running the existing person and guardianship commands for every row inside one transaction.

**Problem**: A nested `commandBus.execute` emits its events and index updates as soon as it finishes, even inside an outer transaction, so a later failure would leave events for rows that were rolled back. The nested context also carried the outer request, whose optimistic-lock header was then compared against each person.

**Rule**: Pass `transactionalEm` and `bulkImport: { skipEvents, skipReindex }` to the nested commands, drop `request` from their context, and emit the events and index updates yourself after the outer commit. Since `authorizeScoped` requires a lock token (2026-10-31, S5.2), a nested update must carry the version the outer command read as `expectedUpdatedAt` in its input (the import passes each matched person's `updatedAt` from its plan), or it answers 400 `lock_token_required`.

Two more facts from #800 (2026-11-27, the enrolment accept): (1) a nested command authorizes with the **caller's**
grants — `people.persons.create`, `people.guardianships.create` and `people.persons.create_account` allow only
`club_admin`, so a coordinator's composed command fails inside with 403 `scope_denied`; check every nested command's
`allowedKinds` while designing, and never widen them unasked (Ask First: security). The approved way out (owner
default on #800, 2026-11-27, "delegated acceptance"): the composing command first authorizes its own user for its own
resource (BR-J5), then runs the owner's commands in `jobCommandContext(container, scope)` plus `transactionalEm` and
`bulkImport`; the owner's command accepts `system_job` only from such a context (`sessionOrJob(ctx, kinds)` in
`people/commands/shared.ts`). The composing command's audit entry names the user; never pass a session context and a
`system_job` grant together. (2) A command in another module
cannot import the owner's event configs (`personEvents`, S4.3): prefer an owner seam that returns its own emitter
(`groups.membershipImporter.emitSideEffects`), else emit the owner's published payload after the commit from a small
service in your module (`enrolment/services/owner-events.ts`) and name the contract it mirrors.

**Applies to**: any Vereino command that composes other commands atomically (the import, the enrolment accept, later
bulk moves).
