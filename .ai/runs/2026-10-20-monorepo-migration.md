# Monorepo migration: Open Mercato app into packages/app

- **Date:** 2026-10-20
- **Agent / tool:** Claude Code (Opus)
- **Trigger:** product owner — monorepo with `packages/app`, `core`, `db`, `ui` on Next.js, TypeScript, React, PostgreSQL/MikroORM, Awilix, Tailwind (frontend) and shadcn/ui (backend); AGENTS.md and README.md describe the architecture. Option chosen: "monorepo around Open Mercato"; plan approved in chat on 2026-10-20 (this file is its written form).
- **Spec / issue / branch:** no feature spec (repository architecture); branch `main`
- **Status:** completed

## Plan and phase status

- [x] **Phase 1 — Move the app.** Open Mercato app (`src`, `public`, `types`, `.mercato`, Next/TS/Jest/ESLint/PostCSS/shadcn configs, `.env.example`, `.ds-check-ignore`, runtime scripts) moved to `packages/app` with `git mv`; root `package.json` = workspaces + `resolutions` + scripts delegating to `@vereino/app`; app `package.json` = former dependencies, scripts, `imports`. Repository/agent tooling stays in root `scripts/`.
- [x] **Phase 2 — Fix paths.** `.gitignore`, `.dockerignore`, `.railwayignore`, `Dockerfile` (workspace manifests, `packages/app` artifacts, `workspaces focus @vereino/app`), Railway scripts, docker-compose state paths, Docker dev entrypoint (`packages/app/node_modules`), Claude Code entity-migration hook, `.ai/qa` moved to `packages/app/.ai/qa`.
- [x] **Phase 3 — Shared packages.** `@vereino/core`, `@vereino/db`, `@vereino/ui` skeletons (package.json, tsconfig, `src/index.ts`, README; shadcn `components.json` in ui); app depends on them via `workspace:*`; `transpilePackages` and Tailwind `@source` wired; `nmHoistingLimits: workspaces` in `.yarnrc.yml`.
- [x] **Phase 4 — Documentation.** AGENTS.md "Stack and Monorepo (MUST)" + app paths prefixed with `packages/app/` + validation commands; README.md "Architecture"; package READMEs.
- [x] **Phase 5 — Install.** `yarn install` in the new layout; make the framework sources that `.ai/guides` link to (`node_modules/@open-mercato/*`, generated facts must not be edited) reachable from the repository root.
- [x] **Phase 6 — Verify.** `yarn generate`, `yarn typecheck`, `yarn typecheck:packages`, `yarn lint`, `yarn ds:check`, `yarn test`, `yarn build`, `yarn lessons:check`; start the app against local PostgreSQL/Redis and open it; Docker image build; fix every failure.
- [x] **Phase 7 — Close.** Complete this log, commit (no push without the product owner).

## Steps

1. Phases 1–4 executed with scripted moves and edits (scratch scripts `mono/migrate.py`, `mono/paths.py`, `mono/dockerfile.py`).
2. Checked phases 1–4 against the code before continuing (files present in `packages/app`, root app files gone, wiring and docs present).

## Decisions

- `nmHoistingLimits: workspaces`: Open Mercato tooling (generator, dev runner, Tailwind `@source "../../node_modules/@open-mercato/..."`) resolves framework packages from the app's own `node_modules`.
- Module entities, migrations, routes and pages stay in `packages/app/src/modules/<id>/` (Open Mercato discovery); shared packages hold reusable code only.
- `.ai` (specs, runs, lessons, guides, harness) stays at the root; only `.ai/qa` (Playwright config that imports `@open-mercato/cli`) moved with the app.
- Root scripts delegate to the app so Docker, Railway and docker scripts keep calling `yarn start`, `yarn generate`, `yarn db:migrate` from `/app`.

## Files changed

- Moved with `git mv`: `src/`, `public/`, `types/`, `next.config.ts`, `tsconfig.json`, `jest.config.cjs`, `jest.setup.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `.env.example`, `.ds-check-ignore`, app runtime scripts and `.ai/qa` → `packages/app/`.
- New: `packages/core`, `packages/db`, `packages/ui` (package.json, tsconfig, `src/index.ts`, README), `packages/app/README.md`, `scripts/link-framework-sources.mjs`, `.ai/lessons/empty-preset-needs-api-keys-and-real-secrets.md`, this log.
- Edited: root `package.json` (workspaces, delegating scripts, `postinstall`), `packages/app/package.json`, `yarn.lock`, `.yarnrc.yml`, `.gitignore`, `.dockerignore`, `.railwayignore`, `Dockerfile`, `docker-compose*.yml`, `docker/scripts/dev-entrypoint.sh`, `scripts/railway-*.sh`, `.claude/hooks/entity-migration-check.ts`, `packages/app/next.config.ts` (transpilePackages), `packages/app/src/app/globals.css` (@source), `packages/app/src/modules.ts` (api_keys), `AGENTS.md`, `README.md`, `.ai/lessons.md`.

## Commands and results

Phase 5:
- `yarn install`: exit 0, 1905 packages, workspaces linked (`packages/app/node_modules/@vereino/{core,db,ui}` → workspace folders). Peer warnings: `react-is` for `@open-mercato/tillio`/`@open-mercato/ui` (framework packages), `@open-mercato/shared` for `@vereino/ui` (fixed by adding it as a peer/dev dependency).
- `scripts/link-framework-sources.mjs` (root `postinstall`): `node_modules/@open-mercato` → `packages/app/node_modules/@open-mercato`; guide links such as `node_modules/@open-mercato/ui/src/backend/DataTable.tsx` resolve; idempotent; survives `yarn install`.

Phase 6 (so far):
- `yarn generate`: exit 0 (29 s); `.mercato/generated` written in `packages/app`; generated `module-package-sources.css` resolves `../../node_modules/@open-mercato/*` inside the app.
- `yarn typecheck`: exit 0 (55 s).
- `yarn typecheck:packages`: exit 0 for core, db, ui; a deliberate type error in `@vereino/core` fails it (exit 1) — the check is real. Script switched from `--exclude` to explicit `--include` lists.
- `yarn lint`: exit 0 — 0 errors, 8 warnings, all in Open Mercato scaffold code (`BackendHeaderChrome`, `StartPageContent`, example module, `eslint.config.mjs`).
- `yarn ds:check`: 223 files passed. `yarn i18n:check-hardcoded`: exit 0 (advisory findings in the example module only). `yarn lessons:check`: valid.
- `yarn test`: the scaffold has no unit tests ("No tests found", exit 0). A temporary probe test importing `@vereino/core`, `@vereino/db` and `@open-mercato/shared/lib/commands` passed under Jest (moved MikroORM transformer works); probe removed.
- `yarn build`: exit 0 (1 min 50 s), no errors or warnings.
- Runtime (after the owner started Docker Desktop; PostgreSQL = the `mercato-postgres` container already running on 5432, database `vereino` created with the `vector` extension; `packages/app/.env` copied from `.env.example` with `DATABASE_URL` pointing at it):
  - `yarn initialize` first failed with `Metadata for entity ApiKey not found`. Reproduced on an untouched checkout of the initial commit (detached worktree, separate database) → template defect of the empty preset, not the migration. Fix: enable `api_keys` in `packages/app/src/modules.ts` (the `auth` setup locks api_keys rows). After `yarn generate` + database reset: `yarn initialize` exit 0 (19.6 s) — migrations, module defaults, demo users, dashboard widgets, search and query indexes.
  - `yarn build` again after the module change: exit 0 (1 min 39 s). `yarn typecheck` exit 0, `yarn lint` 0 errors.
  - `yarn start` (production): first exit 1 — `[auth.jwt] Refusing to run in production with an unsafe signing secret` (placeholder `JWT_SECRET`); after setting fresh `JWT_SECRET`/`AUTH_SECRET` in the untracked `.env`: Next.js "Ready in 302ms", workers started; `GET /api/healthz` 200 `{"status":"ok"}`, `/login` 200, `/` → 307 `/start`.
  - Browser: login page renders (Polish UI via platform i18n); signed in with the seeded demo admin → `/backend` dashboard renders ("Wersja 0.9.0"); only console error = one 401 from the pre-login session probe.
- Docker: `docker build -t vereino:monorepo-check .` — first attempt failed in `yarn install` because the root `postinstall` script was not yet copied into the image; fixed by copying `scripts/link-framework-sources.mjs` with the manifests in all three stages. Second build exit 0 (26 min 44 s, image 8.91 GB). Container smoke test (`docker run … -p 3001:3000`, `DATABASE_URL` via `host.docker.internal`, fresh secrets): `/api/healthz` 200 after 15 s, `/login` 200; container removed afterwards.

## Open problems

- Open Mercato agent-harness scripts (`yarn harness:*`) and `agentic:init --update-harness` assume the standalone layout (`src/` at the root).
- The scaffold ships no unit tests; `yarn test` passes with "No tests found". First Vereino module phase must add them.
- The production image is 8.9 GB (full Open Mercato dependency tree); not optimized in this run.
- `docker compose -f docker-compose.fullapp.yml up --build` (full stack) was not exercised; only the image build and a single-container run against the existing database.

## Next steps

- Push when the product owner asks.
- Phase 1 of the feature spec starts in `packages/app/src/modules/` (club_core, people) with V-11 and the i18n foundation.

## Lessons recorded

- `.ai/lessons/empty-preset-needs-api-keys-and-real-secrets.md` — `api_keys` must be enabled with `auth`; production server refuses placeholder secrets.
