---
title: "A /club page answers a refusal itself; its page guard asks only for a member"
modules: ["activities", "communication", "facilities"]
areas: ["backend-ui"]
topics: ["refusals", "page-guards", "staff-actions"]
---

# A /club page answers a refusal itself; its page guard asks only for a member

**Context**: The UX audit of 2026-11-20 (#489, E20-S10) found staff on the phone sent to refusals: an attendant on `/club/places/maintenance` saw the platform's bare "Brak dostępu", a coordinator who coaches no group got the coach's "New event" and then "You do not coach any group", a coordinator on `/club/messages/new` read the guardian text "Nobody in your household…", and the session edit form explained the coach's rule to everyone.

**Problem**: A `requireFeatures` entry in a `/club` page's `page.meta.ts` makes the catch-all route render the platform's `AccessDeniedMessage` ("Access denied… contact your administrator", a link to `/`), which names no way forward and cannot be localized per case. And a link gated only on the acting context (`selection.role === 'staff'`) offers an action whose target needs more (an own group, a feature).

**Rule**: On a `/club` page, keep `requireFeatures` to what every member holds (`people.self`, `communication.view`); let the page's reads enforce the real feature (their routes already do) and render the page's own refusal on a 403, worded for the reader's case and naming the next action (who can, where). Offer a link only when the reader meets what its target checks (the target's read flag, `contexts.includes('coach')`, a feature check). Never show a text written for one role (a guardian's) to another (staff). Cover each refusal with an integration test that asserts no `auth.accessDenied.title`.

**Applies to**: `packages/app/src/modules/*/frontend/club/**/page.meta.ts`, the `/club` page components and their refusal states, `TEST-489`.
