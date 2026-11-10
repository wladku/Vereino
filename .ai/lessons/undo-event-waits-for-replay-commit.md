---
title: "An atomicReplay undo emits its custom event from onTransactionLifetimeComplete, because the bus commits only after its audit write"
modules: ["payments", "facilities", "platform"]
areas: ["module-data"]
topics: ["commands", "undo-redo", "events", "transactions", "post-commit"]
---

# An atomicReplay undo emits its custom event from onTransactionLifetimeComplete, because the bus commits only after its audit write

**Context**: Issue #184 (found by the review of PR #183): the `payments.charges.generate` undo called `emitAfterCommit('payments.charge.cancelled', …)` at the end of its handler. With `atomicReplay: true` the command bus runs the handler inside its replay transaction and then writes the audit entry (`actionLogService.markUndone`) in the same transaction, so a failing audit write rolled the cancellation back after the persistent event had already gone out — subscribers would act on charges that are still `open`.

**Problem**: In `execute` a command owns its transaction (`inWriteTransaction` returns after the commit), so emitting after it is safe. In `undo` (and an atomic redo) the handler never sees the commit: everything it does, the event included, happens before the bus's own writes and the commit. CRUD side effects are safe there only because `emitCrudUndoSideEffects` queues them and the bus flushes them after the commit; a custom `emit…` call is not queued.

**Rule**: A custom event emitted from an `atomicReplay` undo or redo handler is registered with `onTransactionLifetimeComplete(ctx.transactionalEm, outcome => …)` from `@open-mercato/shared/lib/commands` and emitted only when `outcome === 'committed'` (in payments: `emitAfterReplayCommit` in `commands/shared.ts`). The hook also follows an ambient outer transaction. Prove it with an integration case that makes the bus's audit write fail in a probe process (`.ai/qa/tests/_fixtures/payments-undo-probe`) and asserts no event, plus a committed undo that emits it once.

The same holds for any post-commit effect, not only events. Issue #221: `facilities.closures` flagged the rentals and sessions under a closure only on the first execution (`ctx.transactionalEm ? none : flag`), so an undo of a delete or update, or a redo of a create, put a closure back over a rental entered in the meantime without flagging it, and the undo did not take the occupancy lock that execute takes. An effect that runs in transactions of its own (the reschedule flags, DD-43) cannot run inside the replay: the replay still holds the lock and may roll back. Register it with the same hook (`flagAfterReplayCommit` in `facilities/commands/closures.ts`) and take execute's lock at the top of the undo.

**Applies to**: every `undo`/redo handler in `packages/app/src/modules/*/commands/*.ts` that emits a module event or runs a post-commit effect itself; `payments.charges.generate` undo; `facilities.closures.create|update|delete` undo and redo.
