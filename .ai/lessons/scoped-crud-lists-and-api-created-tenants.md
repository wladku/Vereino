---
title: "Scoped CRUD lists disable the full export and never send an empty $in; API-created test tenants need the init steps"
modules: ["people", "foundation"]
areas: ["module-data", "testing"]
topics: ["data-scoping", "query-engine", "crud-export", "integration-tests", "tenant-setup"]
---

# Scoped CRUD lists disable the full export and never send an empty $in; API-created test tenants need the init steps

**Context**: Issue #38 (foundation spec phase A1, 2026-10-27) built the first record-scoped `makeCrudRoute` lists (`/api/people/persons`, `/api/people/role-assignments`) and the first integration tests that create their own tenant through `POST /api/directory/tenants`.

**Problem**: (1) The installed query engine compiles `{ id: { $in: [] } }` to `"id" in ()`, a PostgreSQL syntax error, so a fail-closed empty scope answered 500 instead of an empty list. (2) `makeCrudRoute` enables CSV/JSON/XML/Markdown export by default, and `?format=json&exportScope=full` skips `list.buildFilters` — the record scope — entirely. (3) A tenant created through the API runs no `setupInitialTenant`, `seedDefaults` or `entities seed-encryption`: it has no `vereino_*` roles, no role features, no encryption maps (so PESEL would be stored in plaintext) and no module schedules. (4) `ensureCustomRoleAcls(em, tenantId)` without its `modules` argument finds no modules outside a request (`tryGetModules` returns `[]` in the CLI), so the roles get no features.

**Rule**: A scoped list returns `{ $and: [scopeWhere(...), businessFilters] }` and sets `list.export: { enabled: false }`; `scopeWhere` fails closed with `{ id: { $exists: false } }`. An integration test that creates its own tenant runs `yarn mercato entities seed-encryption --tenant <id>` and `yarn mercato people bootstrap-admin …` (roles, role features, schedule, first club administrator) before using it (`packages/app/.ai/qa/tests/_fixtures/club.ts`). Code that calls `ensureCustomRoleAcls` from a CLI passes `getCliModules()`.

**Applies to**: `makeCrudRoute` lists of every Vereino module with record scope; `@vereino/core` `scopeWhere`; `packages/app/.ai/qa/tests/**`; module CLIs that seed role ACLs.
