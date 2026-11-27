---
title: "A route handler under src/app bootstraps with @/bootstrap-api, never @/bootstrap"
modules: ["platform", "club_core"]
areas: ["architecture", "debugging"]
topics: ["bootstrap", "route-handler", "command-registry"]
---

# A route handler under src/app bootstraps with @/bootstrap-api, never @/bootstrap

**Context**: #873 added sessionless route handlers (`src/app/manifest.ts`, `src/app/app-icon/[size]/route.tsx`). They read the club through a service that called `bootstrap()` from `@/bootstrap`, copied from `club_core/services/request-club.ts`, which only pages use. In the E31-S01 integration test, the second app process got the manifest request first. From then on every call through the API dispatcher (`/api/people/me`, `/api/auth/feature-check`, the public club routes) answered 500 with `Error: Duplicate command loader registration for key auth:commands:acl`. On the shared app the dispatcher had bootstrapped first, so the manifest's own bootstrap threw instead and the manifest silently fell back to Vereino's name.

**Problem**: In a route handler's bundle, the page bootstrap (`@/bootstrap`) and the API bootstrap (`@/bootstrap-api`, used by `src/app/api/[...slug]` and `src/app/api/healthz`) both register the command loaders. Whichever runs second throws. Which one runs first depends on request order, so a single test can pass or fail depending on what it fetched first. The club-domain fixture starts its process with `stdio: 'ignore'`, so the error is invisible.

**Rule**: In a route handler (`route.ts`, `manifest.ts`, `sitemap.ts`, `icon.tsx` under `src/app`), and in any service that only route handlers call, use `import { bootstrap } from '@/bootstrap-api'`. Use `@/bootstrap` only from server pages and layouts. When a test on the club-domain app sees 500s on every dispatcher route, send the fixture's `stdio` to a file and look for duplicate registrations.

**Applies to**: `packages/app/src/app/**/route.ts(x)`, `src/app/manifest.ts`, `club_core/services/web-app.ts`, `club_core/services/request-club.ts` (pages only), `.ai/qa/tests/_fixtures/club-domain.ts`.
