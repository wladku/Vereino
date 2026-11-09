---
title: "requireFeatures in route and page metadata is all-of; check any-of in the handler"
modules: ["platform", "facilities"]
areas: ["architecture", "module-data"]
topics: ["acl", "require-features", "metadata"]
---

# requireFeatures in route and page metadata is all-of; check any-of in the handler

**Context**: #128 (facilities maintenance): `GET /api/facilities/calendar` and `/club/places` must open for staff with `facilities.view` *or* for a place maintainer who holds only `facilities.maintenance.manage` (DD-36, the redacted calendar).

**Problem**: `metadata.requireFeatures` (API routes) and `PageMetadata.requireFeatures` (pages) in Open Mercato 0.9.0 require every listed feature; there is no any-of option, and the ACL `dependsOn` is not expanded at check time either. Listing both features locks out both audiences; listing one locks out the other.

**Rule**: For an "A or B" audience, set `requireAuth: true` without `requireFeatures` and check in the handler with `rbacService.userHasAllFeatures(userId, [feature], scope)` for each alternative, answering 403 when none holds (`api/calendar/route.ts`). The page then requires sign-in only and renders its permission-denied state from the API's 403. Keep the data narrowing (record scope, redaction) in the handler or service, never in the page.

**Applies to**: every Vereino API route and page whose audience is a union of features; `packages/app/src/modules/facilities/api/calendar/route.ts`, `packages/app/src/modules/facilities/frontend/club/places/**/page.meta.ts`.
