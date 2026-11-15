---
title: "@vereino/ui cannot import a platform primitive whose source fails its strict typecheck (Tabs); keep the rules there and the markup in the app"
modules: ["platform", "club_core", "communication", "facilities"]
areas: ["architecture", "backend-ui"]
topics: ["vereino-ui", "typecheck", "open-mercato-ui", "tabs", "shared-packages"]
---

# @vereino/ui cannot import a platform primitive whose source fails its strict typecheck (Tabs); keep the rules there and the markup in the app

**Context**: #256 (pages with tabs, spec N REQ-N02) first put a shared `RouteTabs` component in `packages/ui` that imported `@open-mercato/ui/primitives/tabs`. `yarn typecheck:packages` failed inside the platform: `node_modules/@open-mercato/ui/src/primitives/tabs.tsx(153,9): error TS2532: Object is possibly 'undefined'`.

**Problem**: Open Mercato ships TypeScript sources as its types, so `skipLibCheck` does not help: every primitive a `@vereino/ui` file imports (even `import type`) is type-checked with the package's `noUncheckedIndexedAccess`. `button`, `input`, `table` and `status-badge` pass; `tabs.tsx` does not. `packages/app` has no such flag, so the same import works there (`GroupsNav`). The node test runner and the app build do not notice; only `typecheck:packages` (a `yarn verify` step) fails.

**Rule**: Before importing a new `@open-mercato/ui` primitive into `packages/ui`, run `yarn typecheck:packages`. When the primitive's source fails it, never weaken the package's tsconfig: keep the pure rules in `@vereino/ui` (with their 100 % unit tests) and render the primitive in the app module (one shell per module, as `ClubRouteTabs`, `CommunicationRouteTabs`, `FacilityTabs` over `route-tabs-model`).

**Applies to**: `packages/ui/src/**`, `packages/ui/tsconfig.json`; any shared component on `@open-mercato/ui/primitives/*`; platform upgrades (recheck whether `tabs.tsx` passes).
