---
title: "Delete the integration report before yarn verify; pass a DI directory only the trusted scope"
modules: ["platform", "people", "facilities"]
areas: ["testing", "module-data"]
topics: ["yarn-verify", "eslint", "playwright-report", "data-scoping", "di-providers"]
---

# Delete the integration report before yarn verify; pass a DI directory only the trusted scope

**Context**: Issue #126 (2026-11-10). After `yarn test:integration:vereino --filter TEST-026`, `yarn verify` failed at `lint` with 168 errors, 162 of them in `packages/app/.ai/qa/test-results/html/trace/assets/*.js`. Separately, assigning a facility attendant to an unknown place answered 500 (`Trying to query by not existing property Place.personId`) instead of 422 `role_place_invalid`.

**Problem**: (1) The Playwright HTML report is git-ignored but ESLint still lints the files on disk, so a local integration run makes the next `yarn verify` fail for code nobody wrote; `jest --coverage` leaves `packages/app/coverage/` the same way. (2) `club_core`'s directory (`findPlaces`, `placeFamily`) spreads its `scope` argument into the MikroORM filter. A command that passed a richer object as the scope (the whole assignment key with `personId`, `role`, …) produced an invalid query — a type check does not catch it because the extra fields fit the structural type.

**Rule**: Before `yarn verify` after a local integration or coverage run, delete `packages/app/.ai/qa/test-results` and `packages/app/coverage`. When calling another module's DI directory, pass exactly `{ tenantId, organizationId }` built from the trusted scope, never a wider object that happens to contain them.

**Applies to**: `yarn verify` (`lint` step), `packages/app/.ai/qa/test-results`, `packages/app/coverage`; `club_core.clubCoreDirectory` and every DI directory that spreads its scope into a filter (`people/services/place-scope.ts`).
