---
title: "In the catch-all API route, take the rate limiter from the foundation, never from the platform getter"
modules: ["foundation"]
areas: ["module-data", "debugging"]
topics: ["rate-limits", "merge-main", "local-patch", "semantic-conflict"]
---

# In the catch-all API route, take the rate limiter from the foundation, never from the platform getter

**Context**: PR #726 (#633) added a per-club request budget to `packages/app/src/app/api/[...slug]/route.ts` that called `getCachedRateLimiterService()` from `@open-mercato/core/bootstrap`. In parallel #738 replaced that import in the same file with the foundation's `sessionlessRateLimiter(req)`. Git merged both without a conflict; the merge-train batch then failed `typecheck` and `yarn build` with `TS2552: Cannot find name 'getCachedRateLimiterService'`, although the PR had passed `yarn verify` on the previous `main`.

**Problem**: The catch-all route is a Vereino local patch of a platform file that several PRs edit at once. A rename or import swap on `main` merges cleanly next to a branch's new call site and only breaks at compile time of the merged result. The platform getter also ignores the integration-test opt-in (`x-om-test-rate-limit: on`), so a limit using it cannot be exercised by a test.

**Rule**: Every rate limit counted in the catch-all route takes its limiter from `sessionlessRateLimiter(req)` (`@/modules/foundation`). After merging `main` into a branch that touches this route, run `yarn typecheck` (or `yarn verify`) on the merge result before pushing, even when the merge reported no conflict.

**Applies to**: `packages/app/src/app/api/[...slug]/route.ts`, `packages/app/src/modules/foundation/services/sessionless-limits.ts`, the merge-main step of `om-auto-fix-pr`.
