---
title: "A widget on a /club injection spot hides itself when its API refuses the caller"
modules: ["payments", "people", "communication", "activities"]
areas: ["backend-ui", "umes", "testing"]
topics: ["injection-widgets", "member-pages", "acl", "feature-gating"]
---

# A widget on a /club injection spot hides itself when its API refuses the caller

**Context**: PR #238 (#117, E07-S10) added the coach's "My groups' payments" tile on `vereino:club:today:sections` with `metadata.features: ['payments.groups.view']`. CI failed `E02-S03-member-accounts.spec.ts` ("no payments tile, screen or API"): a ward without that feature still got the tile, whose title and sr-only heading ("My groups' payments" / "Płatności moich grup") matched `/Payments|Płatności/`. The app log showed `Forbidden - missing required features … /api/payments/group-charges` for the ward.

**Problem**: `InjectionSpot` on the member `/club` pages mounts every widget of the spot regardless of `metadata.features` (the messages tile mounts for wards too and gets a 403 from its count). A tile that renders its chrome while loading or on any failed read therefore shows up for every member, including ones the API refuses.

**Rule**: A widget on a `/club` spot treats `metadata.features` as documentation only. It renders nothing while its first read is pending and nothing when the read answers 401 or 403 (keep the HTTP status on the thrown error); only other failures fall back to the plain link or "Try again". When the tile's text can match another test's negative assertion (e.g. "Payments"), run that test too.

**Applies to**: `packages/app/src/modules/*/widgets/injection/club-*/widget.client.tsx`, the spots `vereino:club:today:sections` and `vereino:club:today:payments` of `people`'s `ClubTodayPage`.
