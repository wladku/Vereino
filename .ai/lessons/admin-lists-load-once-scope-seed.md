---
title: "Backend pages start at the scope of their cookies, so admin lists load once"
modules: ["platform", "ui"]
areas: ["backend-ui", "testing"]
topics: ["organization-scope", "flaky-tests"]
---

# Backend pages start at the scope of their cookies, so admin lists load once

**Context**: On 2026-11-16 E08-S06 failed on #323 because the row menu it had opened on `/backend/facilities/bans` was detached under the click. E06-S06 had failed the same way on the dashboard (#316). The Playwright traces showed each list loaded twice, the second time about 0.5 s later, when the lazily loaded organization switcher answered.

**Problem**: `@open-mercato/shared/lib/frontend/organizationEvents` starts every page load at "no scope", version 0. The switcher's first emission moves it to the real scope and bumps the version. Every query key holding `useOrganizationScopeVersion()` (each Vereino admin table, the platform dashboard) then changes, so the list loads again and redraws its rows. Any test, or person, acting on the first rows races that redraw.

**Rule**: `BackendHeaderChrome` seeds the scope from the switcher's cookies (`om_selected_org`, `om_selected_tenant`) at module load, through `organizationScopeSeed` from `@vereino/ui/organization-scope-seed`. `OrganizationSwitcher` announces a matching answer through the same seed; it sends the event once, so DataTable and OrganizationScopeBoundary still learn the scope they compare a later switch against. Keep both calls when the platform scaffold of these two files is upgraded. A test should not need `waitForLoadState('networkidle')` just to outwait a second list load. `platform/ADMIN-LISTS-LOAD-ONCE.spec.ts` guards it.

**Applies to**: `packages/app/src/components/BackendHeaderChrome.tsx`, `packages/app/src/components/OrganizationSwitcher.tsx`, `packages/ui/src/admin/organization-scope-seed.ts`, and every admin list keyed on the scope version.
