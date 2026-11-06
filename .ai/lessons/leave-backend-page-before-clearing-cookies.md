---
title: "Leave a /backend page (goto about:blank) before clearing cookies to switch users in a test"
modules: ["platform", "people"]
areas: ["testing"]
topics: ["playwright", "sign-in-browser", "clear-cookies", "navigation-race", "backend-pages", "flaky"]
---

# Leave a /backend page (goto about:blank) before clearing cookies to switch users in a test

**Context**: PR #166 (E06-S22) ended its first user's part on `/backend/profile/change-password`, then called `page.context().clearCookies()`, `signInBrowser(...)` for a second user and `page.goto('/club/profile')`. In CI the `goto` failed with `net::ERR_ABORTED`, and on retry with "Navigation to /club/profile is interrupted by another navigation to /login?redirect=%2Fbackend%2Fprofile%2Fchange-password". Locally it passed.

**Problem**: An open platform backend page notices the missing session after the cookies are cleared and redirects to `/login`. That client-side redirect races with the test's next `page.goto`, so whether the test fails depends on timing.

**Rule**: To switch users in one browser page, first `await page.goto('about:blank')`, then `clearCookies()`, then sign the next user in and navigate. Never clear cookies while an authenticated page, especially a `/backend/**` one, is still open.

**Applies to**: `packages/app/.ai/qa/tests/**` specs that sign in more than one user with `signInBrowser` (`tests/_fixtures/club-structure.ts`) in the same page.
