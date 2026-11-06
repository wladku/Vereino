---
title: "signInBrowser sets a new password: fetch a fresh API token for that user afterwards"
modules: ["platform", "people", "activities"]
areas: ["testing"]
topics: ["playwright", "sign-in-browser", "auth-token", "integration-tests"]
---

# signInBrowser sets a new password: fetch a fresh API token for that user afterwards

**Context**: The first run of E06-S02 (#84, 2026-11-04) signed the club administrator in to the browser with `signInBrowser` and then created an account through the API with the token `createClub` returned. The call answered 401 `Unauthorized`. It recurred in E06-S13 (#95, 2026-11-06): the coordinator's token, taken before `signInBrowser`, answered 401 on the next list read, which first looked like an empty list. Corrected twice, the rule is now in `AGENTS.md` → Validation.

**Problem**: `signInBrowser` (`packages/app/.ai/qa/tests/_fixtures/club-structure.ts`) resets the user's password through `PUT /api/auth/users` before the browser login, and the reset ends that user's existing sessions, so a token obtained earlier stops working. The failure surfaces only at the next API call, far from the sign-in.

**Rule**: After `signInBrowser` for a user whose API token the test keeps using, fetch a new one from the returned password — `token = await getAuthToken(request, email, password)` — and store it back (`club.adminToken = token`) so later fixtures and the cleanup use it too (TEST-006 does the same).

**Applies to**: every integration test under `packages/app/.ai/qa/tests/` that mixes `signInBrowser` with API calls for the same user.

**Seen again**: ISSUE-140 (#140, 2026-11-06) signed the coach in with `signInBrowser` and then called `getMe` with `family.coach.token` from `familyFor`; the call failed and the test stopped at `me.body?.person.updatedAt` (undefined). This is the fourth record of the same trap (with `integration-fixture-pitfalls-tokens-crudform-undo` and `journey-test-sign-in-tokens-and-probe-limits`): a candidate for an `AGENTS.md` rule or for `signInBrowser` returning the fresh token itself.
