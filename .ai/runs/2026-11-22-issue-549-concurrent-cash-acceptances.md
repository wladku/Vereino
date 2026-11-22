# Run: #549 — concurrent cash acceptances exhaust the DB pool

- **Goal / trigger:** Cezar task 24d19798, `om-auto-fix-issue 549` (label `cezar`). 25+ parallel
  `POST /api/payments/cash` answered 500/401/503 (`timeout exceeded when trying to connect`).
- **Issue / PR / branch:** #549 / #553 / `fix/issue-549-concurrent-cash-acceptances-exhaust-db-pool`. Route: `debugging` +
  `module-data` (payments, foundation); `direct` (bug fix, no spec).

## Steps

1. Claimed #549 (assignee, `in-progress`, `🤖` claim comment naming this worktree and run).
2. Root cause (confirmed in code, as the issue suspected): `payments.cash.record` opens its write transaction (one
   pooled connection), then reads on other pooled connections before the receipt lock — `authorizeScoped` → the
   `people` scope provider (`em.fork()` of the container `em`, plus `clubToday`), `clubClock` → settings,
   `callerSettlesCash` → `rbacService`. At pool size (`DB_POOL_MAX=20`) every request holds one connection and waits
   for a second until `DB_POOL_ACQUIRE_TIMEOUT` (6 s); auth of new requests starves too (401/503).
3. Fix:
   - `foundation`: additive `prefetchSessionScope(ctx)` and `authorizeScoped(…, { sessionScope })`. The prefetched
     value is bound to its `ctx` in a `WeakMap` and used only for the session source and the same tenant and
     organization the session names; anything else falls back to resolving the scope inside, as before. The scope
     check itself still runs inside the transaction.
   - `payments/commands/cash.ts`: `cashAcceptanceFacts(ctx, scope)` (club today + settles-cash) read before the
     transaction; `acceptCashOnCharges` takes them as `input.facts` instead of reading them inside.
   - `payments/commands/group-charges.ts` (`payments.cash.collect`, shares `acceptCashOnCharges`): settles-cash read
     before the transaction; `today` comes from `authorizeGroupChild` as before.
4. Regression test `ISSUE-549` (payments): 50 manual charges, 50 parallel acceptances with `notify: false`, all 201,
   50 consecutive KP numbers, all listed in "Received by me today".
5. Lesson `no-second-pooled-connection-inside-a-write-transaction`.

## Decisions

- Prefetch before the transaction instead of passing the transaction `em` into the scope provider: the provider and
  RBAC/settings services are shared and resolve their own `em`; feeding them the command's `em` would load partial
  entities into its identity map. The provider already read on another connection, so reading it just before the
  transaction gives the same snapshot guarantees as before.
- Kept the fix to the cash commands the issue names. The same pattern (reads through `ctx.container` inside a write
  transaction) exists in many commands; it only bites under bursts at pool size.
- Not fixed here: the `notify: true` path reads contacts/settings/charge descriptions on other connections after the
  receipt lock — a follow-up issue.
- TEST-080 (`test.fixme` named in the issue) lives on #532's unpushed branch, not on `main`; this PR cannot un-fixme
  it. A comment on #532 asks its run to un-fixme it once this lands.

## Commands and results

- `yarn install && yarn generate && yarn typecheck` — exit 0 (fresh worktree).
- `yarn test:integration:vereino --filter ISSUE-549` with the fix — `1 passed (36.2s)`; no
  `timeout exceeded when trying to connect` in the server log.
- Same test with the four source files reset to `HEAD` (unfixed) — `1 failed` (both attempts): `TimeoutError:
  apiRequestContext.fetch: Timeout 30000ms exceeded. … POST /api/payments/cash`; the server log holds 77
  `timeout exceeded when trying to connect`. Fix restored afterwards.
- First `yarn verify`: `FAIL lint` — the Playwright HTML report of the unfixed run under `.ai/qa/test-results`
  (gitignored, but linted) plus two `restrict-template-expressions` errors in the new test. Removed the report, fixed
  the test; then `FAIL format:check` on two files → `yarn format`.
- After formatting: `ISSUE-549` `1 passed (35.5s)`, `TEST-043` `1 passed (37.1s)`, `TEST-045` `1 passed (38.0s)`.
- Final `yarn verify` — `all 18 step(s) passed`, exit 0.

## Open problems / next steps

- Follow-up issue #554: "Accept cash" with `notify: true` still reads contacts, settings and charge descriptions on other
  pooled connections after the receipt lock, so a burst at pool size with e-mail on can still time out.
- #532's run un-fixmes TEST-080's 50-request case once this PR is on `main` (comment on #532).
- Lint picks up `packages/app/.ai/qa/test-results/html` after a failed local integration run; delete it before
  `yarn verify`.
