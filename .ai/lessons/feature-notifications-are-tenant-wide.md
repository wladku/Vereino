---
title: "Notify a club's staff through its role holders, never through createForFeature"
modules: ["facilities", "notifications", "people"]
areas: ["architecture", "module-data"]
topics: ["notifications", "tenant-isolation", "organization-scope"]
---

# Notify a club's staff through its role holders, never through createForFeature

**Context**: #125 needed "notify the people with `facilities.rentals.approve`" when a guest confirms a booking request (facilities spec *Events* row `facilities.rental.request_verified`). The platform offers `notificationService.createForFeature({ requiredFeature })`, which reads like the literal answer.

**Problem**: `createForFeature` resolves its recipients with `getRecipientUserIdsForFeature(db, tenantId, feature)` (`@open-mercato/core` `notifications/lib/notificationRecipients.ts`): every user of the **tenant** whose user or role ACL grants the feature. It never filters by organization, so in a tenant with several clubs the administrators of every club would be told about one club's request — a cross-club leak of the place name and the request's existence.

**Rule**: For a club-scoped notice, resolve the recipients in the club's organization — the club's role holders through `people.personDirectory.roleHolderIdsOn(scope, 'club_admin' | …, date)` and `findUserIds(scope, personIds)` — and send with `buildBatchNotificationFromType` + `createBatch(notification, { tenantId, organizationId })`, as `activities` does for its coach-needed notice. Use `createForFeature` / `createForRole` only for tenant-wide platform notices.

**Applies to**: every Vereino subscriber or service that notifies staff (`facilities/services/requests.ts` `notifyApprovers`, `activities/services/*-notice.ts`); any spec row that says "notify the people with feature X".
