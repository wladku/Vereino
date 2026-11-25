# Run: issue #728 — pool deadlock in commands that resolve the scope inside the write transaction

- **Trigger:** cezar, `issue.labeled` (`cezar`) on #728, 2026-11-26.
- **Skill:** `om-auto-fix-issue` with the repo-local override.
- **Branch:** `fix/issue-728-pool-deadlock-scope-resolution` (not pushed).

## Steps
1. Read #728: the owner's issue body marks the fix "Behaviour change for every command: Ask First (security/concurrency)". No comments; the timeline holds only label events. No approval is recorded.
2. Traced the cause: `authorizeScoped` → `deriveScope` → `resolveScope` → `people.scopeService.grantsForUser`, which forks the root `em` (a second pooled connection) while the command's transaction holds one. 243 `authorizeScoped(` call sites, 5 pass a prefetched `sessionScope`.
3. Found that a generic prefetch in the 9 `inWriteTransaction` copies would not cover `runCrudCommandWrite` / `ctx.transactionalEm` and undo/redo replay, which are already inside a transaction.
4. Stopped before claiming; posted the analysis and a recommended shape (read the grants on the transaction's `em` through an optional provider parameter) on #728 (comment 7177901069), asking for owner approval.

## Decisions
- Ask First is not approved by the `cezar` label alone; the run rules require a recorded approval, so no claim and no code.

## Files changed
- This run log only.

## Commands and results
- None beyond reads (`gh issue view`, `grep`).

## Next steps
- After an owner comment approves proposal B (or another shape), re-queue #728.
