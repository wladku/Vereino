---
title: "Integration tests take getAuthToken from _fixtures/auth, never from the platform helper: staff sign-in asks for a second factor"
modules: ["foundation", "platform"]
areas: ["testing", "integration"]
topics: ["auth", "second-factor", "integration-tests", "merge-train"]
---

# Integration tests take getAuthToken from _fixtures/auth, never from the platform helper: staff sign-in asks for a second factor

**Context**: PR #831 (staff second factor, #736, 2026-11-26) moved every integration test from `getAuthToken` of
`@open-mercato/core/helpers/integration/api` to `packages/app/.ai/qa/tests/_fixtures/auth.ts`. While it waited, #828
(E27-S01) landed on `main` with the platform import. The PR's own CI was green, but the merge train's batch of #831 on
the new `main` failed `integration (shard 1/6)`: after `signInBrowser`, E27-S01 took a new administrator token with the
platform helper and `POST /api/activities/activities` answered 401 `Unauthorized`.

**Problem**: with the second factor a staff account's `POST /api/auth/login` answers a provisional token
(`mfa_pending`) that every other route refuses. The platform `getAuthToken` returns that token as if it were a session
token, so the failure shows up only at the next API call. A test written on a branch without the second factor passes
there and breaks only after the two branches meet, which is in the merge train, not in either PR's CI.

**Rule**: in `packages/app/.ai/qa/tests/**` import `getAuthToken` (and `clearAuthTokenCache`) from `_fixtures/auth`,
never from `@open-mercato/core/helpers/integration/api`; it finishes the challenge with the e-mailed code. After merging
`main` into a PR that changes sign-in, grep the merged-in specs for the platform import and for raw `/api/auth/login`
calls.

**Applies to**: every integration test and fixture under `packages/app/.ai/qa/tests/`; PRs that change the sign-in
flow and merge `main`.
