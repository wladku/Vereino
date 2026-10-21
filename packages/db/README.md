# @vereino/db

Vereino data tooling on PostgreSQL and MikroORM: shared persistence helpers, migration and seed utilities, test-database helpers used by several modules.

- Module entities and migrations stay in `packages/app/src/modules/<id>/data/entities.ts` and `…/migrations/` — Open Mercato discovers and generates them only there (`yarn db:generate`).
- Uses the application's MikroORM instance (peer dependency); never opens its own connection pool.
- May import `@vereino/core`; never `@vereino/app` or `@vereino/ui`.
- Public API only through `src/index.ts`.

Check: `yarn workspace @vereino/db typecheck`.
