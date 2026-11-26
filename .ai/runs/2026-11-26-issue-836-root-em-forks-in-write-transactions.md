# Run: issue #836 — services still fork the root em inside write transactions (follow-up of #794)

- **Trigger:** cezar, `cezar` label on #836 (owner issue, `bug`, `priority-low`, `risk-medium`), 2026-11-26.
- **Skill:** `om-auto-fix-issue` with the repo-local override.
- **Branch:** `fix/issue-836-root-em-forks-in-write-transactions`.

## Steps
1. Read #836 (owner, no comments, unclaimed) and #794 / lesson `no-second-pooled-connection-inside-a-write-transaction`. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the worktree and branch).
2. Audit: three read-only subagents over disjoint module groups (activities + communication + training; payments + facilities; people + groups + club_core + foundation). Each traced every transaction callback (`inWriteTransaction`, `withAtomicFlush(..., { transaction: true })`, `em.transactional`, `ctx.transactionalEm` undo/redo) to the reads that end on another EntityManager. About 70 call sites, grouped by root cause (list in the PR body).
3. Fixed each root cause by adding an optional trailing `em` to the reader and passing the transaction's `em` from every in-transaction caller (the #728 pattern). Readers that load entities read on `em.fork({ keepTransactionContext: true })` (own identity map, same connection).
4. RBAC inside a transaction (staff declaration, medical date) uses the platform's `userHasAllFeaturesWithEntityManager(em, …)`, documented as additive and transaction-bound in `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md`. A first version prefetched the check before the transaction; replaced because the platform method is simpler and keeps the check in the transaction.
5. Added `packages/app/.ai/qa/tests/foundation/ISSUE-836-club-reads-in-write-transaction.spec.ts`; updated the lesson.

## Decisions
- Optional parameters only: `ClubCoreSettingsService.organizationName(scope, em?)`, `ClubCorePublicSite.publicPlaceSlug(scope, placeId, em?)`, `payments.chargeService.statusOf(ids, ctx, em?)`, `DepartureCommitContext.em?` — additive (BACKWARD_COMPATIBILITY.md §1); no migration, dependency or new module.
- `findConflicts` preview inside a transaction (season rollover) reads the occupancy provider in a savepoint (`em.transactional`) on the same connection, so a provider error still cannot abort the caller; outside a transaction it keeps its own fork.
- `club_core.settings.update` uses `ctx.transactionalEm` on redo (`atomicReplay`) instead of its own fork.
- Departure contributors' `afterCommit` read with the replay transaction when called inside it (undo/redo); the contributors inline the fork instead of importing a runtime helper from `people`.
- Justified, not changed: the platform notifications `createBatch` in `warnUnstaffedSession` (a job, one session at a time, de-duplicated under its advisory lock; moving it out would weaken that); `notifyDepartureConfirmed` / `emitCreatedGuardianships` after the departure transaction (inside the replay transaction only on redo, which the 15-minute preview token refuses in practice); `attachmentService.createScoped` (platform-owned; its `persistLink` bodies are clean); the enterprise optimistic-lock guard (no database read in this build).

## Commands and results
- `yarn generate` — ok. `yarn typecheck` — exit 0. `yarn format` — 9 files reformatted (all touched by this change). `yarn lessons:check` — valid.
- `yarn test:integration:vereino --filter ISSUE-836` **with the fix:** `1 passed` (test 8.3 s). First drafts failed on test data only (`venue_or_place_required` for activities without a place; `medical_consent_missing` for a date without consent); fixed in the test.
- Same **without the fix** (`packages/app/src` checked out from the base, test kept): failed both attempts after 1.1 min, `TimeoutError` on `POST /api/payments/charges`, server log `timeout exceeded when trying to connect`.
- Regression runs, all `passed`: ISSUE-728 (1), ISSUE-549 (1), ISSUE-554 (1), TEST-009 (4), TEST-L03 (3), TEST-L16 (2), TEST-R08 (1), TEST-L01 (3), TEST-O01 (2), TEST-019 (1).
- `yarn verify`: steps up to `typecheck:qa` passed; `lint` hit a V8 heap out-of-memory on this machine (twice; the first time the gitignored Playwright report under `packages/app/.ai/qa/test-results` was also linted, removed). `NODE_OPTIONS=--max-old-space-size=8192 yarn lint` in `packages/app`: exit 0, 0 errors, 166 warnings, none on a changed line. `yarn verify --from secrets:check`: all 18 remaining steps passed.
- `yarn guard`: no blocking findings.

- Review (independent subagent, read-only): no correctness bugs. Three low-severity notes, all fixed in a follow-up commit: the RBAC reads and the life-cycle audience read now use a `keepTransactionContext` fork (no decrypted rows in the transaction's identity map); a departure contributor's `afterCommit` inside the replay transaction runs in a savepoint, so a failed read can no longer abort an undo. Re-run after the fix, all `passed`: ISSUE-836 (1), TEST-009 (4), TEST-O01 (2), TEST-L03 (3), TEST-L06 (1), TEST-L09 (2), TEST-L10 (2); lint (8 GB heap) exit 0; `yarn verify --from secrets:check` 18/18; `yarn guard` no blocking findings.

## Open problems / next steps
- None known; the PR body lists every audited site.
