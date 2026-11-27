---
title: "Replace a platform backend page with a programmatic page-route override in the backend catch-all, not a page: component override"
modules: ["foundation", "platform"]
areas: ["umes", "backend-ui"]
topics: ["component-override", "page-override", "symbol-identity"]
---

# Replace a platform backend page with a programmatic page-route override in the backend catch-all, not a page: component override

**Context**: #737 replaced the platform's backend profile pages (`/backend/auth/profile`,
`/backend/profile/change-password`). A `widgets/components.ts` replacement on the `page:/backend/auth/profile` handle
was generated and registered, yet the production build rendered the platform page (TEST-737, second run). The same run
showed a second trap: a module-private `Symbol()` used as an in-process mark on the auth context differed between an
API route and a command interceptor, because the production server bundles load separate copies of the module.

**Problem**: The backend catch-all resolves the `page:` handle during the RSC pass, but the client
`ComponentOverrideProvider` also calls `registerComponentOverrides` (during SSR, with its own, possibly empty, list) on
the same process-global registry, so the server fold may find nothing; the platform's own example
(`example/components/ComponentOverrideShowcase.tsx`) says a `page:` handle is not reliably overridable. Module-level
identities (symbols, classes, singletons) are not shared across server bundles either.

A third trap: declaring `overrides.routes.pages` with a `load` that imports a React page in `src/modules.ts` breaks
every worker, scheduler and CLI process, which compile that file with esbuild ("Failed to load the app-level modules
file … Refusing to bootstrap", the app never became ready).

**Rule**: To replace a whole backend page, call `applyPageRouteOverrides({ '/backend/<path>': { load } })` in
`packages/app/src/backend-page-overrides.ts`, which the backend catch-all runs before `registerBackendRouteManifests`.
Never put a React import (static or dynamic) in `src/modules.ts`. Keep `page:` component overrides for nothing that
must render. For an in-process mark that two modules check, use a
registered symbol (`Symbol.for('vereino.<module>.<name>')`), never a plain `Symbol()` or an `instanceof` across modules.

**Applies to**: `packages/app/src/backend-page-overrides.ts`, `packages/app/src/modules.ts`, `widgets/components.ts` of any module,
`foundation/lib/email-change.ts`, command and API interceptors that check marks set by routes.
