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
- Integration and gate results: see the PR body.

## Open problems / next steps
- None known; the PR body lists every audited site.
