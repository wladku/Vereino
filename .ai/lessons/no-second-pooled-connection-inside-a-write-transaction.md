---
title: "A write transaction never waits for a second pooled connection"
modules: ["foundation", "payments", "people"]
areas: ["architecture", "debugging"]
topics: ["db-pool", "transactions", "concurrency", "authorize-scoped"]
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
50 requests against `DB_POOL_MAX=20`).

**Applies to**: `packages/app/src/modules/*/commands/**`, `foundation/services/authorize-scoped.ts`
(`prefetchSessionScope`), `payments/commands/cash.ts` (`cashAcceptanceFacts`). Still open: the confirmation e-mail of
"Accept cash" (`notify: true`) reads contacts, settings and charge descriptions on other connections after the
receipt lock.
