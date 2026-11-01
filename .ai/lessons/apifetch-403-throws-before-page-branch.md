---
title: "The platform apiFetch throws ForbiddenError on every 403, so a page's own 403 branch never runs; test the forbidden state in the UI"
modules: ["activities", "platform"]
areas: ["backend-ui", "testing"]
topics: ["api-client", "forbidden", "error-states", "journeys"]
---

# The platform apiFetch throws ForbiddenError on every 403, so a page's own 403 branch never runs; test the forbidden state in the UI

**Context**: The J-002 exit-gate test of epic #22 (2026-11-01) opened the coach attendance list as a coach from outside the group.

**Problem**: The API answered 403, but the page showed its generic load error ("The attendance list could not be loaded", "Try again") instead of "This is not your session". `useAttendanceList` (`activities/components/club/club-client.ts`) checks `call.status === 403` after `apiCall`, but the platform's `apiFetch` (`@open-mercato/ui/backend/utils/api`) throws `ForbiddenError` on every 403 unless the request disables `x-om-forbidden-redirect`, so that branch is dead code. The same pattern sits in the session page and guardian-contacts reads.

**Rule**: A page that renders its own forbidden state either sends the request with the forbidden redirect disabled or catches `ForbiddenError`; a test of a forbidden case asserts the page's forbidden message, not only the API status, so a dead branch is caught.

**Applies to**: member and backend pages that show a page-specific 403 state, and the integration tests of those pages.
