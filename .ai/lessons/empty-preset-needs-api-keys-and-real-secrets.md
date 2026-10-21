---
title: "Enable api_keys with auth and set real secrets before the app boots"
modules: ["auth", "api_keys"]
areas: ["debugging", "architecture"]
topics: ["modules-ts", "mercato-init", "env-secrets", "empty-preset"]
---

# Enable api_keys with auth and set real secrets before the app boots

**Context**: On 2026-10-20 `yarn initialize` on the Open Mercato 0.9.0 empty preset failed at "Setting up RBAC and users" with `Metadata for entity ApiKey not found`. The same failure reproduced on the untouched scaffold (a detached worktree of the initial commit), so it is a template defect, not a consequence of the monorepo move. Afterwards `yarn start` (production server) exited with `[auth.jwt] Refusing to run in production with an unsafe signing secret` because `.env` still held the placeholder `JWT_SECRET` from `.env.example`.

**Problem**: The `auth` module's authorization locks import the `ApiKey` entity from the `api_keys` module, but the empty preset's `src/modules.ts` does not enable `api_keys`, so MikroORM never registers the entity. The production server validates `JWT_SECRET` against the published example values and stops.

**Rule**: Keep `{ id: 'api_keys', from: '@open-mercato/core' }` enabled whenever `auth` is enabled (it is in `packages/app/src/modules.ts` with a comment). For any environment that runs `yarn start` (production mode), set `JWT_SECRET` and `AUTH_SECRET` to fresh values (`openssl rand -hex 32`) in the untracked `packages/app/.env` before `yarn initialize`; never commit them.

**Applies to**: `packages/app/src/modules.ts`, `packages/app/.env`, `yarn initialize`, `yarn start`, Docker and Railway deployments.
