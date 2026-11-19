---
title: "A narrow role's forms read other modules' names through their own module"
modules: ["payments", "people"]
areas: ["architecture", "backend-ui"]
topics: ["roles", "acl", "option-loaders", "treasurer"]
---

# A narrow role's forms read other modules' names through their own module

**Context**: #245 added the finance-only `vereino_treasurer` (payments spec DD-33). The Finance pages and their API
routes were already gated by `payments.*` features, but four form pickers loaded their options from other modules'
CRUD lists: the fee form's groups (`/api/groups/groups`) and activities (`/api/activities/activities`), the order
campaign's sections and groups (`/api/club_core/sections`, `/api/groups/groups`), the discount's and the manual
charge's persons (`/api/people/persons`). Each needs a feature the treasurer must not hold, so the pages opened but the
selects stayed empty (the loaders are `tolerant`, so nothing even showed an error).

**Problem**: A page's own `requireFeatures` says nothing about the features its client calls need. The administrator
holds every module wildcard, so every test run as the administrator passes, and the gap only shows for a narrower role.
Granting the narrow role `groups.view` or `people.view` would open the whole records it is meant not to see.

**Rule**: When a module's page must work for a role that holds only that module's features, grep its components for
`/api/<other-module>` and `fetchCrudList('<other-module>/…')`. Serve the names through the module's own route, reading
the owners' DI directories (`payments/services/directory.ts`) within the module's grant — `GET /api/payments/lookups`
is the example — and test the page's data as that role (TEST-046's treasurer test), not only as the administrator.

**Applies to**: `packages/app/src/modules/*/components/**` option loaders; new narrow roles in
`packages/core/src/roles.ts`; `payments/api/lookups/route.ts`.
