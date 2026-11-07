---
title: "A data/validators.ts that a client component imports must not import @/modules/foundation"
modules: ["club_core", "foundation", "platform"]
areas: ["backend-ui", "module-data"]
topics: ["client-bundle", "validators", "next-build", "foundation-helpers"]
---

# A data/validators.ts that a client component imports must not import @/modules/foundation

**Context**: #96 added contract schemas to `club_core/data/validators.ts` with the foundation's `validityShape` and `refineValidity`. Typecheck, lint and every unit test passed; `yarn build` failed with dozens of "Module not found" errors in `@grpc/grpc-js`. The import trace ran `InstitutionsTable.tsx` / `InstitutionForm.tsx` (client) → `data/validators.ts` → `@/modules/foundation` (`index.ts`) → `services/route-context.ts` / `services/errors.ts` (server code).

**Problem**: `@/modules/foundation` is one barrel of server services; anything a `'use client'` component reaches through it is bundled for the browser. Only the production build sees it, so a change that passes every earlier `yarn verify` step fails last, after minutes.

**Rule**: Before adding an import to a module file, check whether a client component imports that file (`grep` the module's `components/` for it). A file on a client path — `data/validators.ts`, `lib/**`, `components/*-client.ts` — imports only `zod`, `@vereino/core` and its own module's pure files; rebuild the small Zod helper locally from `@vereino/core` (e.g. `isCalendarDate`, `isInvertedPeriod`, and the coded issue `params: { errorCode: 'validity_inverted' }`), never from the foundation barrel.

**Applies to**: `packages/app/src/modules/*/data/validators.ts`, `lib/**`, client components; `@/modules/foundation` (`foundation/index.ts`); `yarn build` (the `build` step of `yarn verify`).
