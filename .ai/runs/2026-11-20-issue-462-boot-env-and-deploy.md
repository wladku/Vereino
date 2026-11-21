# Run log — issue #462 (E18-S01): boot-time variable check, deploys that migrate once and never initialise

- **Goal:** the app refuses to start without its required variables (S8.10); Railway deploys migrate once in a
  pre-deploy step and the start command never runs `yarn initialize` (ADR-013, S14.5); a post-deploy smoke script;
  the deployment runbook; the owner's answers to ENG-Q-03/-04/-05/-10 in the spec.
- **Trigger:** Cezar, label `cezar` on #462 (`om-auto-fix-issue`, feature route; spec exists:
  `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, ADR-013, S8.10, S14.4, phase E4 slice (a)).
- **Branch:** `feat/issue-462-app-startup-deploy-init`. Worktree: Cezar task worktree `d2a138f2-…`.

## Steps

1. Claimed #462 (assignee, `in-progress`, `🤖` claim comment naming the run). No open PR referenced the issue.
2. Read ADR-013, S8.10, S14.4/S14.5, S3.1 local-patch table, the open questions, epic #460 owner decisions, the
   start scripts, `docker/scripts/init-or-migrate.sh`, `instrumentation.ts`, the integration runner's app env
   (`vereino-ephemeral.mjs`) and, read-only, how the owner's sandbox starts the app (`server start`, `NODE_ENV=production`,
   `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, sqlite cache, local queue — all satisfy the new check; the sandbox was not touched).
3. `packages/app/scripts/vereino-boot-env.mjs`: Zod rows of required variables (`DATABASE_URL` always; `JWT_SECRET`,
   `APP_URL` in production; a Redis URL when `CACHE_STRATEGY=redis` / `QUEUE_STRATEGY=async`); problems name variables,
   never values; CLI exits 1. Unit tests at 100 %.
4. Boot entry: `src/instrumentation.ts` (platform file, local patch) imports the check and exits 1 — no Vereino module
   hook runs at boot. Railway: `scripts/railway-start.sh` and `railway-worker.sh` run the CLI first and no longer call
   `init-or-migrate.sh`; new `scripts/railway-predeploy.sh` (check, `yarn db:migrate`, `yarn mercato auth sync-role-acls`)
   is `preDeployCommand` in `railway.toml`.
5. `scripts/smoke.mjs <url>`: health, sign-in page, security headers present today (CSP, Referrer-Policy,
   X-Content-Type-Options, X-Frame-Options; E18-S02 extends the list), `no-store` on `GET /api/auth/profile` with a smoke
   account from `VEREINO_SMOKE_EMAIL`/`VEREINO_SMOKE_PASSWORD` (skipped without). Added to the `test:scripts` coverage
   includes, the coverage-scope guard and the AGENTS.md list; unit tests at 100 %.
6. Integration test `platform/ENG-TEST-12-13-boot-env.spec.ts`: `next start` on the runner's build with
   `CACHE_STRATEGY=redis` and no Redis URL exits non-zero naming it; `sh scripts/railway-start.sh` with an empty
   `DATABASE_URL` fails without initialising; `node scripts/smoke.mjs <runner url>` exits 0 (no-store skipped).
   Two failed approaches on the way: `yarn start` (platform `server start`) refuses a second server in the same app
   folder; removing `DATABASE_URL` passed only while no `packages/app/.env` existed — Next.js fills unset and empty
   variables from `.env`, which `yarn verify`'s `generate` step copies from `.env.example`.
7. Docs: `docs/ops/deploy.md` rewritten as the runbook (environments, Redis volume/persistence, variables by name, deploy,
   first-time initialisation, smoke, per-club steps kept, rollback); `.env.example` Vereino section; spec Q rows and
   S3.1 rows; changelog entry file; `BACKWARD_COMPATIBILITY.md` (Railway pre-deploy, smoke CLI, `VEREINO_*` gap closed).

## Decisions

- The check lives in a `vereino-*.mjs` tooling script, not `@vereino/core`: core has no Zod dependency (a new
  dependency is Ask First), the start scripts need a plain `node` entry, and `test:scripts` enforces 100 % on it.
- No `VEREINO_*` variable is required at boot: none is read by the app yet. ENG-TEST-12's negative case therefore removes a
  platform variable (`DATABASE_URL`); a future `VEREINO_*` row is one line.
- `JWT_SECRET` and `APP_URL` are required only with `NODE_ENV=production` so `yarn dev` keeps working; the integration
  runner, the sandbox and Railway all run production mode.
- The pre-deploy command is a script (`railway-predeploy.sh`) rather than an `&&` chain, so it does not depend on Railway
  running the command through a shell. The role-ACL sync becomes fatal there (it was a warning in `init-or-migrate.sh`):
  a failed sync now fails the deploy and the previous release keeps serving.
- `init-or-migrate.sh` stays for docker compose (local); ADR-013 allows it there.
- No `CONTRIBUTING.md` exists; the issue's "local patch listed in CONTRIBUTING.md" maps to the S3.1 local-patch table of
  the spec, which is where every local patch is listed.

## Commands and results

- `yarn test:scripts` → 249 tests pass; `smoke.mjs` and `vereino-boot-env.mjs` 100 % lines/branches/functions.
- `env -i … DATABASE_URL= sh scripts/railway-start.sh` → exit 1, names `DATABASE_URL` and the Redis URLs; same for
  `railway-predeploy.sh` (exit 1, `DATABASE_URL`).

## Open problems / next steps

- Staging halves of ENG-TEST-12/13 and ENG-TEST-11 wait for the owner's Railway project (owner action in #460).
