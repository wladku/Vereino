---
title: "Leave a /backend page (goto about:blank) before clearing cookies to switch users in a test"
modules: ["platform", "people"]
areas: ["testing"]
topics: ["playwright", "sign-in-browser", "clear-cookies", "navigation-race", "backend-pages", "flaky"]
---

# Leave a /backend page (goto about:blank) before clearing cookies to switch users in a test

**Context**: PR #166 (E06-S22) ended its first user's part on `/backend/profile/change-password`, then called `page.context().clearCookies()`, `signInBrowser(...)` for a second user and `page.goto('/club/profile')`. In CI the `goto` failed with `net::ERR_ABORTED`, and on retry with "Navigation to /club/profile is interrupted by another navigation to /login?redirect=%2Fbackend%2Fprofile%2Fchange-password". Locally it passed. The same pattern then failed `E03-S01` twice in CI (PRs #198 and #200), and 17 other user switches in 13 specs had it too.

**Problem**: An open platform backend page notices the missing session after the cookies are cleared and redirects to `/login`. That client-side redirect races with the test's next `page.goto`, so whether the test fails depends on timing.

**Rule**: Switch users in one browser page with `switchBrowserUser(page, request, club, userId, email)` from `tests/_fixtures/club-structure.ts`: it goes to `about:blank`, clears the cookies and calls `signInBrowser`. To end a session without signing someone in through the API (a reset link, `signInThroughForm`, an anonymous public page), call `signOutBrowser(page)` from the same fixture. Never call `page.context().clearCookies()` directly in a spec, and never clear cookies while an authenticated page, especially a `/backend/**` one, is still open.

**Applies to**: every `packages/app/.ai/qa/tests/**` spec that signs a second user in, or signs the first one out, in the same page. `grep -rn "clearCookies()" packages/app/.ai/qa/tests` should list only `signOutBrowser` in `_fixtures/club-structure.ts`.
