---
title: "A sessionless integration check needs request.newContext(); rate limits are off under OM_INTEGRATION_TEST"
modules: ["club_core", "platform"]
areas: ["testing"]
topics: ["playwright", "sessionless", "public-pages", "rate-limits", "status-badge"]
---

# A sessionless integration check needs request.newContext(); rate limits are off under OM_INTEGRATION_TEST

**Context**: Issue #29 (2026-10-30) added integration tests for the public club and section pages and their API.

**Problem**: (1) Playwright's `request` fixture keeps the cookies of an earlier sign-in in the same test, so a "guest" read of an authenticated route passes by accident. (2) `OM_INTEGRATION_TEST` turns route rate limits off globally (`shared/lib/ratelimit/config.ts`), so a 429 cannot be reached. (3) The platform `StatusBadge` drops `data-testid`.

**Rule**: Make every sessionless check with a fresh `await playwright.request.newContext({ baseURL })` and dispose of it. Declare and document rate limits, and record in the run log that the 429 is not integration-tested. Wrap a `StatusBadge` in an element that carries the test id.

**Applies to**: tests under `packages/app/.ai/qa/tests/` for public routes (`/p/*`, `GET /api/*/public/*`).
