---
title: "A dispatched in-app notice links to its type's static linkHref: a per-recipient target needs its own type"
modules: ["foundation", "facilities", "notifications"]
areas: ["module-data", "architecture"]
topics: ["notifications", "dispatch", "link-href", "email-template"]
---

# A dispatched in-app notice links to its type's static linkHref: a per-recipient target needs its own type

**Context**: #287 (2026-11-18) sent the reschedule notice through the foundation `dispatch` to coordinators (target: the place's day on M-11) and to administrators (target: B-24 "Do przeniesienia"). The spec named one notification type.

**Problem**: The dispatch worker builds every in-app notification with `buildBatchNotificationFromType(type, …)` and passes no `linkHref` (DD-M07: ids and generic keys only), so the in-app link is always the type's static `linkHref`. Only the e-mail template's `link(params)` can carry ids such as a place or a date. One type cannot send two audiences to two pages.

**Rule**: For each in-app target, declare one notification type and one e-mail template that reuse the same title and body keys (precedent: `facilities.maintenance_due` / `…_planner`, `facilities.reschedule_needed` / `…_rentals`). Keep the in-app link to a page that needs no ids, and put the precise target (ids, dates, filters) in the e-mail's `link(params)`. Do not extend the foundation dispatch for one link: that changes a shared contract.

**Applies to**: `packages/app/src/modules/*/notifications.ts`, `*/emails/templates.ts`, `foundation/services/dispatch-worker.ts`.
