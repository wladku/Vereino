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
calls. A test that starts its own app server (ENT-TEST-03 of #814 runs a second `next start` with licence keys) cannot
use the fixture's sign-in helpers, which post to the runner's `BASE_URL`: post the login and
`/api/foundation/second-factor/verify` to that server's URL, with `capturedCount`, `isChallenge` and `waitForCode` from
`_fixtures/auth`. A raw `page.request.post('/api/auth/login')` answers 200 with only the provisional token, so the next
page opens `/login` (#814, 2026-11-27). It happened again on #883 (2026-11-27): its new spec
`ISSUE-847-backend-outlines-and-part-filter` was written before #831 landed, the PR's CI stayed green, and the train's
batch failed with 401 on the administrator's first API call after `signInBrowser`; nothing but review catches the
platform import yet, so a branch older than #831 must grep its own new specs too.

**Applies to**: every integration test and fixture under `packages/app/.ai/qa/tests/`; PRs that change the sign-in
flow and merge `main`.
