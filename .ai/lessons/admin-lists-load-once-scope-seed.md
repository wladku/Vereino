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

**The first page of a session is not seeded** (#545, 2026-11-22): a browser signed in through `POST /api/auth/login` (the `signInBrowser` fixture, often after `clearCookies()`) has no switcher cookies yet, so its first backend page still loads every list twice. A table whose rows hold local state (inline editors, typed values) lost that state when the re-keyed query showed DataTable's loading row: TEST-L23's Save stayed disabled on slow CI runners. Such a table keeps its rows across a key change with `placeholderData: keepPreviousData` and keys each row's editor by the record id and version. A test that guards it holds `/api/directory/organization-switcher` with `page.route` until the input is typed (TEST-L23).

**Applies to**: `packages/app/src/components/BackendHeaderChrome.tsx`, `packages/app/src/components/OrganizationSwitcher.tsx`, `packages/ui/src/admin/organization-scope-seed.ts`, and every admin list keyed on the scope version.
