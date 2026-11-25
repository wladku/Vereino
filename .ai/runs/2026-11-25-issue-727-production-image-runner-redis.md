# Run: production image runs the mercato CLI and the Redis cache (#727)

- **Goal / trigger**: Cezar run of `om-auto-fix-issue` for #727 (label `cezar`, 2026-11-25). Bug found by the capacity
  test of #633 (PR #726): the Dockerfile's `runner` stage could run no `yarn mercato` process, and
  `CACHE_STRATEGY=redis` failed in the Next production bundle.
- **Issue / branch**: #727, `fix/issue-727-production-image-runner-redis`. Route: `debugging` (direct fix, no spec).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree).
2. Wrote `scripts/image-smoke.sh`: builds the `runner` stage and runs it as Railway does (pre-deploy on an empty
   database, `yarn initialize --no-examples`, `railway-start.sh` with its default `CACHE_STRATEGY=redis`,
   `railway-worker.sh`) against throwaway PostgreSQL and Redis containers, then `scripts/smoke.mjs`, an authenticated
   `GET /api/auth/users` and a worker liveness check.
3. Reproduced on the unmodified image: pre-deploy failed with
   `Cannot find package 'react' imported from /app/packages/ui/src/emails/EmailLayout.ts`.
4. Problem 1: `@vereino/ui` / `@vereino/db` declare React / MikroORM as peers; the production focus install puts them
   only in `packages/app/node_modules`, which Node never searches from `packages/ui/src`. Fix: `RUN ln -s
   app/node_modules packages/node_modules` in the runner stage. Verified on a derived image: pre-deploy, initialize and
   app start passed; the app then failed on Redis (problem 2 reproduced, `/api/healthz` never 200).
5. Problem 2: the bundled `@open-mercato/cache` loads ioredis via `__turbopack_context__.A(...)`; Turbopack's interop
   wraps ioredis's CommonJS export (the `Redis` class) in a callable namespace; `pickRedisConstructor` picks the
   wrapper and `new wrapper()` calls the class without `new`.
   - First attempt: `ioredis` in `serverExternalPackages`. Rebuilt and re-ran: **still failed** — the external module is
     still imported through the same interop (`module.exports = require("ioredis")`, then `.A()`). Reverted.
   - Fix: the cache prefers `globalThis.__non_webpack_require__` when set; `src/instrumentation.ts` now sets it to
     `createRequire(<cwd>/package.json)` on the Node runtime. Checked the server bundle: the only other readers
     (node-gyp-build copies) look at `__webpack_require__` first, so they are unaffected.
6. Rebuilt the image and ran `IMAGE=vereino-727-runner:after2 SKIP_BUILD=1 scripts/image-smoke.sh`: **PASS**.
7. Added CI job `image-smoke` (not a required check; the owner decides), a note in `docs/ops/deploy.md`, and lesson
   `runner-image-workspace-peers-and-bundled-cjs-classes`. The lesson `capacity-stack-production-image-gaps` lives on
   PR #726, not on `main`; once both merge its rule ("run the builder stage with sqlite") is obsolete — noted in the PR.

## Decisions

- Symlink instead of installing dev dependencies (image size) or moving peers to `dependencies` (a second React copy).
- A shell smoke script rather than an `.mjs`: it orchestrates Docker only and reuses the unit-tested `scripts/smoke.mjs`.

## Files changed

`Dockerfile`, `packages/app/src/instrumentation.ts`, `scripts/image-smoke.sh` (new), `.github/workflows/ci.yml`,
`docs/ops/deploy.md`, `.ai/lessons/runner-image-workspace-peers-and-bundled-cjs-classes.md` (new), this log.

## Commands and results

- `IMAGE=vereino-727-runner:before SKIP_BUILD=1 scripts/image-smoke.sh` → FAIL (react not found in pre-deploy).
- derived image with the symlink → FAIL at `/api/healthz` (`Class constructor Redis cannot be invoked without 'new'`).
- `scripts/image-smoke.sh` with `ioredis` external → FAIL (same Redis error).
- `IMAGE=vereino-727-runner:after2 SKIP_BUILD=1 scripts/image-smoke.sh` → PASS (health 200, sign-in page, security
  headers, no-store, `GET /api/auth/users` 200, worker running).
- `yarn verify` → all 22 steps passed.
- `yarn test:integration:vereino --filter ENG-TEST-12-13` → 3 passed.

## Open problems / next steps

- Make `image-smoke` a required check if the owner wants the image guarded on every PR (it builds the image, ~10 min).
- Upstream: `@open-mercato/cache` `pickRedisConstructor` should prefer `.default`/`.Redis` over a callable namespace.
