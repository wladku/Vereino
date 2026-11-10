---
title: "The platform apiFetch throws ForbiddenError on every 403, so a page's own 403 branch never runs; test the forbidden state in the UI"
modules: ["activities", "payments", "platform"]
areas: ["backend-ui", "testing"]
topics: ["api-client", "forbidden", "error-states", "journeys"]
---

# The platform apiFetch throws ForbiddenError on every 403, so a page's own 403 branch never runs; test the forbidden state in the UI

**Context**: The J-002 exit-gate test of epic #22 (2026-11-01) opened the coach attendance list as a coach from outside the group.

**Problem**: The API answered 403, but the page showed its generic load error ("The attendance list could not be loaded", "Try again") instead of "This is not your session". `useAttendanceList` (`activities/components/club/club-client.ts`) checks `call.status === 403` after `apiCall`, but the platform's `apiFetch` (`@open-mercato/ui/backend/utils/api`) throws `ForbiddenError` on every 403 unless the request disables `x-om-forbidden-redirect`, so that branch is dead code. The same pattern sits in the session page and guardian-contacts reads.

**Rule**: A page that renders its own forbidden state either sends the request with the forbidden redirect disabled or catches `ForbiddenError`; a test of a forbidden case asserts the page's forbidden message, not only the API status, so a dead branch is caught.

In Vereino the read passes `OWN_FORBIDDEN_STATE` from the module's `components/client-helpers.ts` (fixed for the member and backend record pages on 2026-11-01).

The same holds for a widget that hides itself on 403: the `/club` coach-payments tile (#117) checked the status after `apiCall` without the header, so a ward got the tile. E02-S03 asserted "no payments text" with `toHaveCount(0)`, which passes before the read answers, so main stayed green until a slower run (PR #242, 2026-11-10). An absence assertion waits for the read it depends on (`page.waitForResponse`) first.

**Applies to**: member and backend pages and injected widgets that show or hide on a 403, and the integration tests of those pages.
