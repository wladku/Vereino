# Deployment runbook

How Vereino is deployed to Railway, checked after a deploy and rolled back (engineering standards S14.4, S14.5, ADR-012,
ADR-013, S8.10). Variables appear here by name only; values live in Railway as sealed variables and never in the
repository, a log, a spec or a transcript. Add a step here in the same pull request that makes it necessary.

Not covered yet: security headers and the CSP decision (E18-S02), nightly off-site backups and the restore drill
(E18-S03), uptime monitoring and alerts (E18-S04).

## Environments

| Environment | Where | Deploys | Data |
|---|---|---|---|
| local | a developer machine (`yarn dev`), the integration test runner (`yarn test:integration:vereino`) | by hand | throwaway |
| sandbox | the owner's machine (`vereino-sandbox-env/sandbox.mjs`), outside Railway | `node sandbox.mjs upgrade` | synthetic |
| `staging` | Railway project (Hobby plan, EU West), environment `staging` | every commit on `main`, automatically | synthetic only |
| `production` | the same Railway project, environment `production` | a maintainer deploys a release tag by hand; never automatic | the club's real data |

Each Railway environment has four services: **app** (`railway.toml`), **worker** (`railway.worker.toml`), **PostgreSQL**
and **Redis** (Railway templates). The owner runs and pays for the project (ENG-Q-03). The Hobby plan has no
point-in-time recovery: recovery rests on the nightly off-site dump (RPO ≤ 24 h; E18-S03).

### Redis

BullMQ keeps the queue (`QUEUE_STRATEGY=async`) and the scheduler's jobs in Redis, so Redis data must survive a
restart:

- attach a **volume** to the Redis service (Railway's Redis template mounts one at `/data`);
- enable append-only persistence: start Redis with `--appendonly yes --appendfsync everysec` (or set them with
  `CONFIG SET` and `CONFIG REWRITE`), keeping the template's RDB snapshots as well;
- set `--maxmemory-policy noeviction`: BullMQ refuses to work reliably with an eviction policy, and evicting a job
  key loses a job silently;
- the app and the worker reach Redis through `REDIS_URL` (private network URL).

## Variables

The app and the worker check the required variables at boot and refuse to start, naming each missing or malformed
variable without printing a value (`packages/app/scripts/vereino-boot-env.mjs`, S8.10). The pre-deploy command runs the
same check first. `packages/app/.env.example` lists every variable with a placeholder.

Required by the boot check (production and staging run with `NODE_ENV=production`, set by the Docker image):

| Variable | Services | Notes |
|---|---|---|
| `DATABASE_URL` | app, worker | `postgres://` URL of the environment's PostgreSQL (Railway reference variable) |
| `JWT_SECRET` | app, worker | at least 32 characters, unique per environment (`openssl rand -hex 32`); the platform also rejects placeholders |
| `APP_URL` | app, worker | public `https://` base URL of the environment, used in e-mailed links |
| `REDIS_URL` | app, worker | required because the start scripts default to `CACHE_STRATEGY=redis` and `QUEUE_STRATEGY=async`; `CACHE_REDIS_URL` / `QUEUE_REDIS_URL` override it per subsystem |

Also set per environment (not checked at boot, but the feature they serve fails without them):

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | session and cookie signing secret, unique per environment |
| `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` | tenant data encryption fallback key; never change it on a running environment |
| `NEXT_PUBLIC_APP_URL`, `PLATFORM_PORTAL_BASE_URL` | same value as `APP_URL` |
| `SYSTEM_EMAIL_PROVIDER`, `RESEND_API_KEY`, `NOTIFICATIONS_EMAIL_FROM` | outbound e-mail (S12.6) |
| `OM_ENABLE_ENTERPRISE_MODULES=false` | no effect since the enterprise package was removed (ADR-023, #466); keep it false so a reinstalled package stays off |
| `DEMO_MODE=false`, `SELF_SERVICE_ONBOARDING_ENABLED=false` | no demo widgets, no self-service tenants |
| `OM_INIT_ADMIN_PASSWORD` | only for the one-time initialisation below; remove it afterwards |

Never set in staging or production: `OM_TEST_MODE`, `OM_INTEGRATION_TEST`, `OM_AUTOLOGIN_*`, `OM_ALLOW_DEV_AUTH_SECRET`.
No `VEREINO_*` variable is required at boot yet; a new one is added to the boot check, to `.env.example` and to this
table in the same pull request.

## Deploy

Every deploy of the **app** service runs, in this order (ADR-013, S14.5):

1. **Build** the `Dockerfile` (`runner` stage; production build of the app).
2. **Pre-deploy** `sh ./scripts/railway-predeploy.sh` (`preDeployCommand` in `railway.toml`): the boot check, then
   `yarn db:migrate`, then `yarn mercato auth sync-role-acls`. It runs once per deploy, never per replica. Any failure
   fails the deploy and the previous release keeps serving.
3. **Start** `sh ./scripts/railway-start.sh`: the boot check, then `yarn start`. It never migrates and never runs
   `yarn initialize`: an empty or wrong `DATABASE_URL` fails the start instead of setting up a new, empty database.
4. **Health check** `/api/healthz` (probes PostgreSQL and, with `CACHE_STRATEGY=redis`, Redis) must answer 2xx within
   60 s, or Railway keeps the previous release.

The **worker** service (`sh ./scripts/railway-worker.sh`) runs the boot check and then `yarn mercato queue worker
--all`; it never migrates. Deploy it after the app service, from the same commit.

- **staging**: every commit on `main` deploys automatically; turn on Railway's "Wait for CI" so a red `main` never
  deploys.
- **production**: only a commit with a release tag. A maintainer opens the production environment in Railway,
  deploys the tagged commit to the app service, waits for it to turn healthy, then deploys the same commit to the
  worker.

### First deploy of a new environment (one time)

The start and pre-deploy commands never initialise a database. On a new, empty database:

1. Deploy once; the pre-deploy command creates the schema through the migrations.
2. From a Railway shell on the app service (`railway ssh` or the service's shell), with `OM_INIT_ADMIN_PASSWORD` set,
   run `yarn initialize --no-examples` once. It refuses to run on a database that already has users.
3. Remove `OM_INIT_ADMIN_PASSWORD`, sign in as the superadmin and set up the club; then run the per-club setup below.

## After every deploy

1. Run the smoke check against the environment:

   ```bash
   node scripts/smoke.mjs https://<environment-host>
   ```

   It reports each check (`health`, `sign-in page`, `security headers`, `no-store`) and exits 0, or 1 naming the failed
   checks. The `no-store` check signs in with a dedicated smoke account given in `VEREINO_SMOKE_EMAIL` and
   `VEREINO_SMOKE_PASSWORD` (a user without club data; never a real person's account) and is skipped without them.
2. Run the per-club setup steps below when the release notes name one.

### Per-club schedules

A module's `setup.ts` `seedDefaults` registers the scheduled jobs of a club when the club is set up. A club that
existed before the release that added a schedule, or that was created without `seedDefaults` (for example through the
API), has no such schedule until the module's idempotent club setup runs for it. Run it once per club after the
release; a second run registers nothing twice.

| Module | Command | Registers | Since |
|---|---|---|---|
| `activities` | `yarn mercato activities set-up-club --tenant <id> --org <id>` | occurrence generation, guardian confirmation expiry, declaration reminders, unassigned-session warnings | #192 |
| `payments` | `yarn mercato payments set-up-club --tenant <id> --org <id>` | charge generation (06:00), overdue reminders (09:00), checkout reconciliation and order-campaign closing (every 15 minutes) | #301, #405 |
| `facilities` | `yarn mercato facilities set-up-club --tenant <id> --org <id>` | rental lifecycle and request expiry (every 15 minutes), maintenance reminders (06:00) | #122, #125, #128, #221 |

The commands print what they registered; every entry under `schedules` must be `true`. A later change of the club's time zone
re-registers the time-zoned schedules on its own (`activities:reregister-schedule`, `payments:reregister-schedules`).

## Rollback

Roll back to the previous release when the smoke check or the health check fails after a deploy, or when a defect
reaches production:

1. In Railway, open the app service's **Deployments**, pick the last good deployment and choose **Redeploy** (or
   **Rollback**); do the same for the worker. The old image starts without migrating.
2. Breaking schema changes use expand/contract across two releases (S5.4), so the previous release keeps working on the
   migrated schema. When a
   release's migration itself is the defect, do not revert it by hand; fix forward with a new migration in a new
   release, or restore the database (E18-S03 runbook) when data was damaged.
3. Run the smoke check against the environment again and record the rollback, its reason and the release tags in the
   incident or release notes.

## Checks of this runbook

- ENG-TEST-12 (local): `yarn test:integration:vereino --filter ENG-TEST-12` starts the production build with
  `CACHE_STRATEGY=redis` and no Redis URL and expects a non-zero exit naming the variable; it also runs the smoke check
  against the runner's app. On staging: remove a required variable from the app service,
  deploy, and expect the deploy to be marked failed while the previous release keeps serving.
- ENG-TEST-13 (local, same filter): `scripts/railway-start.sh` with an empty `DATABASE_URL` fails and never initialises.
  On staging: point the app service at an empty database URL and deploy; the pre-deploy command fails.
- ENG-TEST-11: `node scripts/smoke.mjs <staging-url>` with the smoke account, once E18-S02 adds the remaining headers.
