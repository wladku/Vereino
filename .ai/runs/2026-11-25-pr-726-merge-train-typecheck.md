# Run: PR #726 merge-train failure — typecheck after #738

- **Goal and trigger:** PR #726 (issue #633) carried `merge-train-failed`; `merge-train/verdict` = failure on 384d64b8 ("broke a batch on its own"). Unattended cezar task: read the failing result, fix it, merge `main`, push without rewriting history, never merge.
- **Branch:** `feat/issue-633-capacity-test-and-limits` (worked on a detached HEAD at its origin tip, pushed with `HEAD:<branch>`).

## Steps

1. Batch run 45668791809 (`merge-train/batch`, commit 14b285fa = #726 on main 7456ec26): `gate` failed at `typecheck`, `integration (shard 3/6)` failed in `yarn build` — the same error in both:
   `src/app/api/[...slug]/route.ts(452,32): error TS2552: Cannot find name 'getCachedRateLimiterService'.`
2. Root cause: a semantic conflict, not a textual one. #738 (758a9aea, rate limits on sessionless routes) replaced the platform import `getCachedRateLimiterService` in the catch-all API route with the foundation helper `sessionlessRateLimiter(req)`. This PR added the per-club request budget (DD-M10) below it, still calling `getCachedRateLimiterService()`. Git merged both cleanly; the merged file no longer imports the name.
3. Merged `origin/main` into the branch (no conflicts) and changed the club budget to take its limiter from `sessionlessRateLimiter(req)`, like the route-level limit above it; folded the two `@/modules/foundation` imports into one.

## Decisions

- `sessionlessRateLimiter(req)` instead of re-importing the platform getter: #738 made the foundation the single place that hands out the limiter (it returns the platform limiter unless an integration run opts in with `x-om-test-rate-limit: on`), so both limits in the route behave the same and the local patch comment stays true.

## Files changed

- `packages/app/src/app/api/[...slug]/route.ts`
- `.ai/runs/2026-11-25-pr-726-merge-train-typecheck.md`
- `.ai/lessons/catch-all-api-route-rate-limiter-comes-from-foundation.md`

## Commands and results

- `yarn verify` on the merge result: all 22 steps passed (typecheck, lint, test, build included).
- `yarn test:integration:vereino --filter ISSUE-738`: 4 passed.
- `yarn test:integration:vereino --filter TEST-M08`: 2 passed.
- `yarn lessons:check`: passed. `yarn guard`: no blocking findings (one warning on `.github/workflows/ci-failure-ledger.yml`, which came from `main`).

## Open problems / next steps

- None known; the merge train re-picks the PR after the new commit.
