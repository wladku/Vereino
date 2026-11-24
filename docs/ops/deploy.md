# Deployment runbook

How Vereino is deployed to Railway, checked after a deploy and rolled back (engineering standards S14.4, S14.5, ADR-012,
ADR-013, S8.10). Variables appear here by name only; values live in Railway as sealed variables and never in the
repository, a log, a spec or a transcript. Add a step here in the same pull request that makes it necessary.

One production instance serves every club, and one deploy updates every club at once (owner decision D-034,
`.ai/specs/research/decisions/D-034-many-clubs-on-one-instance.md`, epic #626). A bad release therefore reaches every
club together: [Production release](#production-release) is the process that keeps that risk small, and its
[checklist](#production-release-checklist) is what a maintainer runs for each release.

Not covered yet: security headers and the CSP decision (E18-S02), nightly off-site backups and the restore drill
(E18-S03), uptime monitoring and alerts (E18-S04).

## Environments

| Environment | Where | Deploys | Data |
|---|---|---|---|
| local | a developer machine (`yarn dev`), the integration test runner (`yarn test:integration:vereino`) | by hand | throwaway |
| sandbox | the owner's machine (`vereino-sandbox-env/sandbox.mjs`), outside Railway | `node sandbox.mjs upgrade` | synthetic |
| `staging` | Railway project (Hobby plan, EU West), environment `staging` | every commit on `main`, automatically | synthetic only |
| `production` | the same Railway project, environment `production` | a maintainer deploys a release tag by hand, inside the release window; never automatic | the real data of every club, plus the maintainers' demo club (synthetic) |

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
| `VEREINO_CLUB_DOMAIN` | optional; the club domain of an instance with many clubs (see *Club addresses* below). Unset: one club per instance |
| `VEREINO_HOME_CLUB_SLUG` | **deprecated**; the public slug of the one club of an instance without `VEREINO_CLUB_DOMAIN`, which `/` leads a guest to. Ignored once `VEREINO_CLUB_DOMAIN` is set; kept as the single-club fallback |

Never set in staging or production: `OM_TEST_MODE`, `OM_INTEGRATION_TEST`, `OM_AUTOLOGIN_*`, `OM_ALLOW_DEV_AUTH_SECRET`.
No `VEREINO_*` variable is required at boot yet; a new one is added to the boot check, to `.env.example` and to this
table in the same pull request.

## Production release

A release is a `vX.Y.Z` tag cut by the release pull request ([`github-settings.md`](github-settings.md), section 7;
ADR-021). The code of a release reaches every club in one deploy; what can still be held back per club is behaviour,
through a club setting (below).

### Stages: staging, the demo club, every club

1. **Staging.** Staging runs every commit on `main`, so it runs the tag commit as soon as the release pull request
   merges. If `main` has moved on since, redeploy the tag commit's deployment on staging (app, then worker) from
   Railway's **Deployments** list. On staging, the smoke check passes and a maintainer walks every item of the release
   notes as an administrator of the seeded demonstration club, in both languages.
2. **The demo club.** Production carries one club the maintainers own, with synthetic data and no real person in it.
   After the production deploy, the smoke check passes and the maintainer repeats the release-notes walk in this club
   before announcing anything. A behaviour behind a club setting is switched on here first and watched for at least a
   day. The demo club, like every club, is created with `yarn mercato club_core create-club`
   ([`clubs.md`](clubs.md)).
3. **Every club.** The release is announced. A behaviour behind a club setting is switched on for chosen clubs, then
   for every club, in later steps that need no deploy.

The demo-club stage cannot keep code from the other clubs: the deploy updates them all. A change that is risky for
clubs ships behind a club setting, or waits.

### Release window

Production releases happen **Tuesday to Thursday, 20:30–22:30 Europe/Warsaw**: after most evening trainings, before
the night jobs and the 06:00 and 09:00 schedules, and never on a weekend, when matches and tournaments run. No release
on the day before a public holiday, and none when no maintainer can watch the 06:00 and 09:00 jobs the next morning
(charge generation, maintenance and overdue reminders). Only a `priority-extreme` fix (outage, data loss, security) is
deployed outside the window; it follows the same checklist and its notes say why it could not wait.

### Release notes for club administrators

`CHANGELOG.md` is written for maintainers and operators. Club administrators get their own notes, in **Polish and
English**, published in the body of the tag's GitHub release and sent to the administrators at least one working day
before the window:

- what changes for administrators, coaches, guardians and members, in plain words and without internal ids;
- what a club has to do, if anything (a new setting to review, a text to check);
- what is switched on only for chosen clubs, and how a club asks for it;
- the release window, and that the app may answer slowly for a few minutes during it.

The notes carry no personal data and no club names other than the demo club. Until a message to every club's
administrators can be sent from the app, the maintainer sends it by e-mail.

### Schema changes: expand, then contract, across two releases

The pre-deploy command migrates while the previous release still serves every club, and a rollback starts the previous
release on the migrated schema (S5.4, S14.6). So every migration in a release works with the code of the release before
it:

- **Release N (expand)**: add the new table, column (nullable or with a default) or index; write both shapes or read
  both; backfill every club idempotently and in batches, so a backfill for 1,000 clubs neither locks a table nor
  stops halfway without a rerun.
- **Release N+1 (contract)**: only after release N has served production for at least a week without a
  rollback, enforce the constraint, switch the code to the new shape only, and drop the old one. Dropping a column or
  table still needs a product-owner decision and a verified backup (S5.4).

A breaking migration (rename, drop, type change, new `NOT NULL` without a default) never ships in one deploy. A pull
request with a contract step names the release that shipped its expand step; a release whose notes list a contract
step whose expand step is not yet in production is not cut.

### A new behaviour for chosen clubs only

ADR-019 still holds under D-034: **no feature-flag framework**. Its three switches cover a shared instance:

- **Club settings** carry per-club behaviour. A behaviour that must reach chosen clubs first gets a setting in
  `club_core_club_settings` (`club_core/lib/settings.ts`) whose default keeps the old behaviour. The column is an expand
  step like any other (a migration, so Ask First), and the setting is changed in that club's settings by an
  administrator or, for a rollout switch the club does not choose itself, by a maintainer. Once every club has it on and
  the old path is not needed for a rollback, a later release removes the old path, and the setting too when it is not a
  real club choice.
- **Environment kill switches** (`VEREINO_EMAIL_SENDING_ENABLED`, `VEREINO_ONLINE_PAYMENTS_ENABLED`) stop an external
  side effect for **every** club at once; they are incident tools, not a rollout tool. ADR-019 names them, but the app
  does not read them yet.
- **Module enablement** in `src/modules.ts` stays a per-instance switch for whole modules.

Revisit ADR-019 when a percentage or time-based rollout is needed, or when more than three rollout switches are live
at once; until then a new framework is out of scope (#634).

### Production release checklist

Run it in order and record it in the release's GitHub release or its tracking issue. Stop and roll back on any red
step after the deploy.

1. [ ] The release pull request is green and merged; `vX.Y.Z` and its GitHub release exist.
2. [ ] Every migration in the release is an expand step, or a contract step whose expand step is already in production.
3. [ ] Staging runs the tag (app and worker); `node scripts/smoke.mjs <staging-url>` passes.
4. [ ] The release notes are walked on staging's demonstration club, in Polish and English.
5. [ ] The release notes (PL + EN) are in the GitHub release and were sent to club administrators a working day ago.
6. [ ] It is the window (Tue–Thu 20:30–22:30 Europe/Warsaw); a maintainer is free tomorrow until 10:00.
7. [ ] Deploy the tag to production: app, wait until healthy, then the worker from the same commit.
8. [ ] `node scripts/smoke.mjs <production-url>` passes; no new error fingerprint in the logs for 15 minutes.
9. [ ] The release notes are walked in the production demo club.
10. [ ] The per-club setup commands the release notes name are run for every club, every `schedules` entry `true`.
11. [ ] New club-setting switches are on in the demo club only; the plan for chosen clubs is in the release issue.
12. [ ] Next morning: the 06:00 and 09:00 jobs ran for every club (worker logs, `monitoring.md` checks).

## Deploy

Every deploy of the **app** service runs, in this order (ADR-013, S14.5):

1. **Build** the `Dockerfile` (`runner` stage; production build of the app).
2. **Pre-deploy** `sh ./scripts/railway-predeploy.sh` (`preDeployCommand` in `railway.toml`): the boot check, then
   `yarn db:migrate`, then `yarn mercato foundation sync-role-acls-if-changed` ([role ACL sync](#role-acl-sync)). It
   runs once per deploy, never per replica. Any failure fails the deploy and the previous release keeps serving.
3. **Start** `sh ./scripts/railway-start.sh`: the boot check, then `yarn start`. It never migrates and never runs
   `yarn initialize`: an empty or wrong `DATABASE_URL` fails the start instead of setting up a new, empty database.
4. **Health check** `/api/healthz` (probes PostgreSQL and, with `CACHE_STRATEGY=redis`, Redis) must answer 2xx within
   60 s, or Railway keeps the previous release.

The **worker** service (`sh ./scripts/railway-worker.sh`) runs the boot check and then `yarn mercato queue worker
--all`; it never migrates. Deploy it after the app service, from the same commit.

- **staging**: every commit on `main` deploys automatically; turn on Railway's "Wait for CI" so a red `main` never
  deploys.
- **production**: only a commit with a release tag, inside the release window, following the
  [checklist](#production-release-checklist). A maintainer opens the production environment in Railway, deploys the
  tagged commit to the app service, waits for it to turn healthy, then deploys the same commit to the worker.

### Role ACL sync

The platform's `yarn mercato auth sync-role-acls` adds every module's default role features (`setup.ts`
`defaultRoleFeatures`) to the roles of **every tenant**, and each club is a tenant (DD-M01 of the many clubs spec), so
with many clubs it costs tens of thousands of queries per deploy. The pre-deploy step therefore runs
`yarn mercato foundation sync-role-acls-if-changed` (DD-M11, #673):

- It hashes the merged role-feature defaults of every enabled module and the installed `@open-mercato/core` version
  (a platform upgrade may change the sync itself) and compares the hash with the one stored after the last successful
  sync (module config `foundation` / `role_acl_defaults_hash`, instance scope).
- Equal: no sync; it prints `{"status":"skipped","reason":"unchanged",…}`.
- Different, or nothing stored yet: it runs `auth sync-role-acls` once over every tenant (one `Synced role ACLs for
  tenant …` line per club), stores the new hash and prints `{"status":"synced","reason":"changed"|"first-run",…}`. A
  failed sync stores nothing and fails the deploy, so the next deploy syncs again.
- `--force` always syncs. Use it when role ACLs must be re-applied although no default changed, for example after a
  restore of the database or a by-hand change to a role's ACL:
  open a shell on the app service (`railway ssh` or the service's shell in Railway) and run
  `yarn mercato foundation sync-role-acls-if-changed --force`.
- The sync only **adds** features; it never removes one a release dropped (`auth/AGENTS.md`).

### First deploy of a new environment (one time)

The start and pre-deploy commands never initialise a database. On a new, empty database:

1. Deploy once; the pre-deploy command creates the schema through the migrations.
2. From a Railway shell on the app service (`railway ssh` or the service's shell), with `OM_INIT_ADMIN_PASSWORD` set,
   run `yarn initialize --no-examples` once. It refuses to run on a database that already has users.
3. Remove `OM_INIT_ADMIN_PASSWORD`. Create each club, starting with the demo club, with `yarn mercato club_core
   create-club` ([`clubs.md`](clubs.md)); it runs the per-club setup below itself.

## After every deploy

1. Run the smoke check against the environment:

   ```bash
   node scripts/smoke.mjs https://<environment-host>
   ```

   It reports each check (`health`, `sign-in page`, `security headers`, `no-store`) and exits 0, or 1 naming the failed
   checks. `security headers` requires the S8.4 set — CSP (without `'unsafe-eval'`), `Referrer-Policy`,
   `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy` and `Strict-Transport-Security`. The `no-store` check signs in with a dedicated smoke account given in `VEREINO_SMOKE_EMAIL` and
   `VEREINO_SMOKE_PASSWORD` (a user without club data; never a real person's account) and is skipped without them.
2. Run the per-club setup steps below when the release notes name one.

### Per-club schedules

A module's `setup.ts` `seedDefaults` registers the scheduled jobs of a club when the club is set up. A club that
existed before the release that added a schedule, or that was created without `seedDefaults` (for example through the
API), has no such schedule until the module's idempotent club setup runs for it. Run it once per club after the
release; a second run registers nothing twice.

| Module | Command | Registers | Since |
|---|---|---|---|
| `activities` | `yarn mercato activities set-up-club --tenant <id> --org <id>` | occurrence generation, guardian confirmation expiry, declaration reminders, unassigned-session warnings, dead declaration-link purge (daily) | #192, #525 |
| `payments` | `yarn mercato payments set-up-club --tenant <id> --org <id>` | charge generation (06:00), overdue reminders (09:00), checkout reconciliation and order-campaign closing (every 15 minutes), dead order-link purge (daily), invariant check (03:00) | #301, #405, #525, #531 |
| `facilities` | `yarn mercato facilities set-up-club --tenant <id> --org <id>` | rental lifecycle and request expiry (every 15 minutes), maintenance reminders (06:00), dead rental-link purge (daily) | #122, #125, #128, #221, #525 |
| `people` | `yarn mercato people retention-sweep --tenant <id> --org <id> --dry-run`; when the club confirms the counts, `yarn mercato people retention-sweep --tenant <id> --org <id> --register-schedule` | former participants' retention sweep (03:00, club spec REQ-041): the first real run anonymises everyone who left the club `former_participant_retention_months` ago or earlier (default 12), so it runs only after the dry run; it prints `scheduleRegistered: true` | #471 |

The commands print what they registered; every entry under `schedules` must be `true`. A later change of the club's time zone
re-registers the time-zoned schedules on its own (`activities:reregister-schedule`, `payments:reregister-schedules`).

## Club addresses

With `VEREINO_CLUB_DOMAIN` set (many clubs spec phase 3, DD-M02; #631), every club is reached at
`https://<public slug>.<club domain>`, from the public slug in its settings:

- **Before setting it:** a wildcard DNS record `*.<club domain>` (and the bare domain) points at the app service, with
  a certificate for both (owner action, D12; on Railway a wildcard custom domain plus the delegated `_acme-challenge`
  record). Keep `APP_URL` on its own host (for example `app.<club domain>`); it stays the instance's address.
- **What changes:** `/` on a club's address opens that club (its public page while published, else its sign-in page);
  its sign-in page signs in to that club only; `/p/<slug>` pages opened anywhere else move to the club's address, so
  printed links and QR codes keep working; links in Vereino e-mails point at the recipient's club address and the
  sender's display name is "<club> via Vereino" in front of `NOTIFICATIONS_EMAIL_FROM`'s address. The bare domain and
  `APP_URL`'s host show a neutral landing page and the maintainers' sign-in; any other host answers 404. A session of
  one club opened on another club's address is sent back to its own club's address.
- **Still on `APP_URL` (owner's decision of 2026-11-23 on #631, option (c)):** the platform's password reset (`/reset`
  on a club's address moves to `APP_URL`), the platform's own notification e-mails and the account invitations, which
  link to the reset page. A later decision moves them (an upstream change or an override).
- **Check after setting it:** open `https://<slug>.<club domain>/` of two clubs, the bare domain and an unknown label
  (404); send a test announcement and check its link and sender.
- **Rollback:** while one club exists, unset the variable. With several clubs, unsetting it strands every club but the
  one in `VEREINO_HOME_CLUB_SLUG` and breaks e-mailed links; fix forward instead.

## Rollback

Roll back to the previous release when the smoke check or the health check fails after a deploy, or when a defect
reaches production. A rollback, like a deploy, changes every club at once. Decide within 30 minutes of the defect being
seen during the window; outside it, follow the severity levels of [`incident.md`](incident.md).

When the defect sits behind a club setting, switch that setting off for the affected clubs first: it needs no deploy
and leaves the other clubs alone. Roll back only when that is not enough:

1. In Railway, open the app service's **Deployments**, pick the last good deployment and choose **Redeploy** (or
   **Rollback**); do the same for the worker. The old image starts without migrating.
2. Breaking schema changes use expand/contract across two releases (S5.4), so the previous release keeps working on the
   migrated schema. When a
   release's migration itself is the defect, do not revert it by hand; fix forward with a new migration in a new
   release, or restore the database (E18-S03 runbook) when data was damaged.
3. Run the smoke check against the environment again and record the rollback, its reason and the release tags in the
   incident or release notes.
4. Tell the club administrators, in Polish and English, that the release was withdrawn and what they may have seen;
   the withdrawn release's expand steps stay in the database, and their contract steps wait until a fixed release has
   served production for at least a week.

## Checks of this runbook

- ENG-TEST-12 (local): `yarn test:integration:vereino --filter ENG-TEST-12` starts the production build with
  `CACHE_STRATEGY=redis` and no Redis URL and expects a non-zero exit naming the variable; it also runs the smoke check
  against the runner's app. On staging: remove a required variable from the app service,
  deploy, and expect the deploy to be marked failed while the previous release keeps serving.
- ENG-TEST-13 (local, same filter): `scripts/railway-start.sh` with an empty `DATABASE_URL` fails and never initialises.
  On staging: point the app service at an empty database URL and deploy; the pre-deploy command fails.
- ENG-TEST-11 (local): `yarn test:integration:vereino --filter ENG-TEST-11` checks the headers on the production build,
  `no-store` on authenticated API responses, runs the smoke check with a throwaway smoke account and opens the admin UI
  under the CSP without a violation. On staging: `node scripts/smoke.mjs <staging-url>` with the smoke account; every
  check must pass (none skipped).
