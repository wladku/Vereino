---
title: "A cross-module contributor writes in the caller's transaction and emits after the commit; node-only helpers stay out of lib files the client imports; a training session takes only an absence"
modules: ["people", "groups", "activities"]
areas: ["architecture", "module-data", "testing"]
topics: ["di-contracts", "transactions", "events", "client-bundle", "integration-tests", "declarations"]
---

# A cross-module contributor writes in the caller's transaction and emits after the commit; node-only helpers stay out of lib files the client imports; a training session takes only an absence

**Context**: Issue #306 (2026-11-18, people life-cycle phase L4) built the departure: `people.persons.depart` ends `people`'s rows and lets each module's `people.departure.<module>` contributor end its own (the `groups` memberships first) in one transaction, with an undo until the last day.

**Problem**: (1) A contributor that called its module's own commands would open its own transaction, so a refused departure could leave memberships ended; writing through the caller's EntityManager keeps it atomic but skips the side effects the module's commands emit (`groups.membership.*`, on which the role sync and the `activities` declaration cleanup listen). (2) Mutating rows and then letting a contributor query on the same EntityManager inside one `withAtomicFlush` phase risks lost scalar changes. (3) The preview token used `node:crypto` in `lib/departure-rules.ts`, which the Leaving tab and the phone page also import: the client bundle cannot take it. (4) The integration test's `declare(…, 'yes')` on a `training` session answered 422 `declaration_kind_absence_only`, and a new declaration answers 201, not 200.

**Rule**: A cross-module contributor (`preview`, `apply`, `undo`, `afterCommit`) reads and writes only with the `em` it receives and returns a snapshot plus a change list; the owner calls each contributor's `afterCommit` after the commit, which emits the module's CRUD events (`emitCrudSideEffects` / `emitCrudUndoSideEffects`) and never rolls back. Flush after every batch of mutations before the next query in the same phase. The undo restores a value only where it is still the one the command wrote. Keep server-only helpers (`node:crypto`, tokens) in their own `lib/*.ts` file so client components can import the pure rules. In tests, declare `no` (an absence) on training sessions and accept 200 or 201 from `declare`.

**Applies to**: `packages/app/src/modules/people/services/departure.ts`, `commands/departures.ts`, `groups/services/departure-contribution.ts`, the phase L5 contributors (`activities`, `payments`, `club_core`, `facilities`), `packages/app/.ai/qa/tests/**` declaration fixtures.
