# Run: issue #728 — pool deadlock in commands that resolve the scope inside the write transaction

- **Trigger:** cezar, `issue.labeled` (`cezar`) on #728, 2026-11-26.
- **Skill:** `om-auto-fix-issue` with the repo-local override.
- **Branch:** `fix/issue-728-pool-deadlock-scope-resolution`.

## Steps
1. Read #728: the owner's issue body marks the fix "Behaviour change for every command: Ask First (security/concurrency)". No comments; the timeline holds only label events, so no approval was recorded.
2. Traced the cause: `authorizeScoped` → `deriveScope` → `resolveScope` → `people.scopeService.grantsForUser`, which forks the root `em` (a second pooled connection) while the command's transaction holds one; the provider's `clubToday` → `clubCoreSettings.get` forks another. 243 `authorizeScoped(` call sites, 5 passed a prefetched `sessionScope`.
3. Stopped before claiming and posted the analysis and proposals on #728 (comment 7177901069): B (read on the transaction's `em`) recommended over A (generic prefetch in `inWriteTransaction`, which misses `runCrudCommandWrite` / `ctx.transactionalEm` and undo/redo replay).
4. The owner told the run in the cezar cockpit to continue autonomously without asking; recorded that as approval of B on #728 (claim comment 7177916996) and claimed the issue (assignee, `in-progress`, `🤖` comment).
5. Implemented B:
   - `foundation/services/scope-contract.ts`: `ScopeReadOptions { em? }`; `ScopeProvider.grantsForUser|grantsForPerson(subject, options?)`; `resolveScope(ctx, options)` and `resolveScopeForPerson(ctx, subject, options)` forward it. Exported from `@/modules/foundation`.
   - `foundation/services/authorize-scoped.ts`: `deriveScope` passes the transactional `em` for the session and token sources; the prefetch stays valid (doc updated).
   - `people/services/scope-service.ts`: reads with `options.em.fork({ keepTransactionContext: true })` (MikroORM 7.2.5), else a root fork as before; `clubToday(…, em)`.
   - `people/services/club-clock.ts`, `club_core/services/settings.ts`: optional `em` on `clubSettings`, `clubToday` and `ClubCoreSettingsService.get`.
   - Other in-transaction scope reads: `communication/commands/threads.ts` (reply's `loadThreadAccess`), `payments/services/season-rollover.ts` (`writesFees`), `activities/services/declaration-links.ts` (`linkPersons`) pass their `em`.
   - `payments/commands/orders.ts`: the session payer (payments gate + scope) is resolved before `inWriteTransaction`; the token path still redeems inside.
6. Added `packages/app/.ai/qa/tests/foundation/ISSUE-728-scope-read-in-write-transaction.spec.ts`: 50 concurrent `POST /api/people/persons`, then 50 concurrent `PUT`s (commands that never prefetched), against the ephemeral `DB_POOL_MAX=20`.
7. Updated lesson `no-second-pooled-connection-inside-a-write-transaction`.

## Decisions
- B over A: covers every path that already runs inside a transaction (platform CRUD writes, replay) and keeps the scope read inside the write's transaction.
- `fork({ keepTransactionContext: true })` instead of the command's `em` itself: the provider's partial `fields` loads stay out of the command's identity map.
- The payments gate keeps its own connection (no `em` seam); the order commands call it before the transaction instead.
- `prefetchSessionScope` stays (5 callers, additive contract); no longer needed for the deadlock.
- BC: optional parameters on the protected DI contract `vereino.scopeProvider` and on `clubCoreSettings.get` — additive (BACKWARD_COMPATIBILITY.md §1).

## Commands and results
- `yarn generate` — ok; `yarn typecheck` — exit 0.
- `yarn test:integration:vereino --filter ISSUE-728` **without the fix** (fix reverted, test only): failed both attempts with `TimeoutError: apiRequestContext.fetch: Timeout 30000ms exceeded. → POST /api/people/persons`.
- Same **with the fix**: `1 passed` (test 7.8 s).
- Regression runs for the other touched paths: see the PR body (E07-S09, TEST-L16, TEST-M12, TEST-017).
- `yarn verify`, `yarn guard`: see the PR body.

## Open problems / next steps
- Other services reached from inside write transactions may still fork the root `em` (e.g. `clubClock` in commands, the payments gate, RBAC); #728 covers the scope resolution. A wider audit would be a follow-up.
