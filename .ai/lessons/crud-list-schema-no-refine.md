---
title: "A makeCrudRoute list query schema stays a plain z.object: no .refine, cross-field checks go in buildFilters"
modules: ["people", "platform"]
areas: ["module-data"]
topics: ["zod", "openapi", "make-crud-route", "validation"]
---

# A makeCrudRoute list query schema stays a plain z.object: no .refine, cross-field checks go in buildFilters

**Context**: #83 added `.refine(ageFrom <= ageTo)` to `personListQuerySchema`. `yarn typecheck` and the unit tests passed, but the integration run died in `yarn initialize` with `Cannot overwrite keys on object schemas containing refinements. Use .safeExtend() instead.` — the CRUD OpenAPI factory (`createCrudOpenApiFactory` → `withIdsQueryParam`) calls `.extend()` on the list schema, and zod 4 refuses that on a refined object. The OpenAPI bundle then failed and every `POST /api/people/persons` answered 500 at runtime.

**Problem**: Nothing at compile time or in unit tests flags it; it only shows when the generated OpenAPI bundle or the route module loads, and the failure looks unrelated (500 on create, "Bundling failed" in the build log).

**Rule**: Keep the `list.schema` (and `querySchema`) of a `makeCrudRoute` route a plain `z.object(...)`. Validate per field in zod; put a cross-field rule in `buildFilters` and throw a module error code from `api/errors.ts` (e.g. 400 `people_filter_age_range`). After changing a list schema, check the build log for `[OpenAPI] Bundling failed`.

**Applies to**: every `packages/app/src/modules/<id>/api/**/route.ts` built with `makeCrudRoute`, and the schemas in `data/validators.ts` they pass as `list.schema` or OpenAPI `querySchema`.
