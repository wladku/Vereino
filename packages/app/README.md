# @vereino/app

The Vereino application — an Open Mercato app on Next.js, React, TypeScript, PostgreSQL/MikroORM and Awilix.

- Vereino modules live in `src/modules/<id>/` (entities, migrations, commands, API routes, admin and frontend pages, events, i18n catalogs, `di.ts`); enabled modules are listed in `src/modules.ts`.
- Configuration: `next.config.ts`, `tsconfig.json`, `jest.config.cjs`, `eslint.config.mjs`, `components.json` (shadcn/ui), `.env` (copy from `.env.example`).
- Runtime and dev scripts: `scripts/` (dev runner, `mercato` CLI wrapper, design-system and i18n checks).
- Integration tests: `.ai/qa/tests/` (Playwright).
- Reuses `@vereino/core`, `@vereino/db` and `@vereino/ui` from the workspace.

Run commands from the repository root (`yarn dev`, `yarn generate`, `yarn typecheck`, `yarn test`, `yarn build`, `yarn mercato …`) or with `yarn workspace @vereino/app <script>`. Architecture and rules: [`../../README.md`](../../README.md), [`../../AGENTS.md`](../../AGENTS.md).
