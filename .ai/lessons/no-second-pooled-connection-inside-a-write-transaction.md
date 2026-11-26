---
title: "A write transaction never waits for a second pooled connection"
modules: ["foundation", "payments", "people"]
areas: ["architecture", "debugging"]
topics: ["db-pool", "transactions", "concurrency", "authorize-scoped", "scope-provider"]
---

# A write transaction never waits for a second pooled connection

**Context**: #549. 25 or more parallel `POST /api/payments/cash` against the ephemeral app (`DB_POOL_MAX=20`,
`DB_POOL_ACQUIRE_TIMEOUT` 6 s) answered 500 `timeout exceeded when trying to connect`, plus 401/503 from requests
that could not even authenticate. `payments.cash.record` opened its write transaction (one pooled connection) and
then called `authorizeScoped` → the `people` scope provider (`container.resolve('em').fork()`), `clubClock` →
settings service and `callerSettlesCash` → `rbacService`; each of these reads on another pooled connection. With as
many concurrent commands as the pool has connections, each holds one and waits for a second: none proceeds until the
acquire timeout. Retries fail the same way while the burst lasts.

**Problem**: The pattern is everywhere (`freshEm(container)`, `clubClock(ctx.container, …)`, the scope provider) and
harmless at low concurrency, so it passes every functional test; it only shows when a burst reaches the pool size. A
serializing lock (the receipt numbering advisory lock) makes it worse: the waiters on the lock each hold a
connection, so a holder that needs a second connection after the lock deadlocks as well.

**Rule**: In a command that many callers run at once, read everything that goes through another service's own
`EntityManager` (scope via `prefetchSessionScope(ctx)` passed to `authorizeScoped(…, { sessionScope })`, club clock,
RBAC features, settings) **before** `inWriteTransaction`/`withAtomicFlush` opens, and inside the transaction query
only with the transaction's `em`. Prove it with a concurrency integration test above the pool size (ISSUE-549 sends
50 requests against `DB_POOL_MAX=20`). Side effects queued in the transaction count too (#554): the contact
resolver reads the club settings and a fresh `EntityManager` decrypts other rows, so an e-mail's recipients and texts
are read before the transaction as well (`readConfirmations`), and the transaction keeps only `dispatch.enqueue(em, …)`.
A value read early is used only when the transaction authorized the same scope object (`authorized.scope ===
prefetched.scope`); otherwise the command reads it again inside, as before.

**Since #728** the scope itself no longer needs a prefetch: `authorizeScoped` passes its transactional `em` to the
scope contract (`resolveScope(ctx, { em })`, `ScopeProvider.grantsForUser(subject, { em })`), and the `people`
provider and `clubCoreSettings.get(scope, em)` read with `em.fork({ keepTransactionContext: true })` — a fork with
its own identity map on the transaction's connection. A service that a command calls inside its transaction takes
the caller's `em` the same way instead of forking the root (`container.resolve('em').fork()`); a service that cannot
(the payments gate, RBAC) is called before the transaction, as `payments.orders.*` now does with the session payer.
ISSUE-728 (50 person creates and 50 updates against `DB_POOL_MAX=20`) hung past the 30 s request timeout before.

**Applies to**: `packages/app/src/modules/*/commands/**`, `foundation/services/authorize-scoped.ts`
(`prefetchSessionScope`), `foundation/services/scope-contract.ts`, `people/services/scope-service.ts`,
`payments/commands/cash.ts` (`cashAcceptanceFacts`, `readConfirmations`), `payments/commands/group-charges.ts`
(`groupChildFacts`). ISSUE-554 repeats ISSUE-549 with `notify: true`.
