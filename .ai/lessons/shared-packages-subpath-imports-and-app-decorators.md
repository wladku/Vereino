---
title: "Shared packages import their own files through #src/* and take MikroORM decorators from the app"
modules: ["platform"]
areas: ["architecture", "testing"]
topics: ["workspaces", "typescript", "node-test", "mikro-orm", "dependencies"]
---

# Shared packages import their own files through #src/* and take MikroORM decorators from the app

**Context**: The first real exports of `@vereino/core` and `@vereino/db` (foundation spec phase A1, issue #38, 2026-10-27). Relative imports written as `./scope.ts` passed the package's own `typecheck` and `node --test`, but `yarn typecheck` in `packages/app` failed with TS5097 ("An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled") on every value import and `export *` inside the package. In `@vereino/db`, importing `@mikro-orm/decorators/legacy` failed under `node --test` with `Cannot find package 'reflect-metadata'`.

**Problem**: `node --test` (type stripping) needs a full file specifier, while the app compiles the packages' sources with its own platform-owned `tsconfig.json`, which does not allow `.ts` specifiers. The `legacy` entry of `@mikro-orm/decorators` loads its optional peer `reflect-metadata`, which only `packages/app` installs; with `nmHoistingLimits: workspaces` it cannot be resolved from `packages/db`, in tests, the CLI or the Next build — and a MikroORM copy loaded from `packages/db` would be a second runtime instance besides the app's.

**Rule**: Inside `packages/{core,db,ui}/src`, import sibling files through the package's `imports` map (`"#src/*": "./src/*.ts"`, specifier `#src/<file>`), never `./<file>.ts`; `import type` may keep a `.ts` specifier. `@vereino/db` imports MikroORM only with `import type`: it records column metadata with the decorators the consumer passes in (`decorateScopedEntityBase({ PrimaryKey, Property })` in a module's `data/entities.ts`) and exports fresh option objects for `@Property(...)`. Prove a package change with the app's `yarn typecheck`, not only the package's own.

**Applies to**: `packages/core`, `packages/db`, `packages/ui` sources and tests; `ScopedEntityBase` and the column helpers of `@vereino/db`; any new shared package consumed by `packages/app`.
