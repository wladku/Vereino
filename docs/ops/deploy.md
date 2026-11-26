# Deployment runbook

How Vereino is deployed to Railway, checked after a deploy and rolled back (engineering standards S14.4, S14.5, ADR-012,
ADR-013, S8.10). Variables appear here by name only; values live in Railway as sealed variables and never in the
repository, a log, a spec or a transcript. Add a step here in the same pull request that makes it necessary.

One production instance serves every club, and one deploy updates every club at once (owner decision D-034,
`.ai/specs/research/decisions/D-034-many-clubs-on-one-instance.md`, epic #626). A bad release therefore reaches every
club together: [Production release](#production-release) is the process that keeps that risk small, and its
[checklist](#production-release-checklist) is what a maintainer runs for each release.

Security headers (E18-S02), nightly off-site backups and the restore drill (E18-S03, [`backups.md`](backups.md)) and
uptime monitoring and alerts (E18-S04, [`monitoring.md`](monitoring.md)) and the edge proxy that D-043 adds on a
trigger ([`edge-proxy.md`](edge-proxy.md)) have their own runbooks.

## Environments

| Environment | Where | Deploys | Data |
|---|---|---|---|
| local | a developer machine (`yarn dev`), the integration test runner (`yarn test:integration:vereino`) | by hand | throwaway |
| sandbox | the owner's machine (`vereino-sandbox-env/sandbox.mjs`), outside Railway | `node sandbox.mjs upgrade` | synthetic |
| `staging` | Railway project (Pro plan, EU West; D-039), environment `staging` | every commit on `main`, automatically | synthetic only |
| `production` | the same Railway project, environment `production` | a maintainer deploys a release tag by hand, inside the release window; never automatic | the real data of every club, plus the maintainers' demo club (synthetic) |

Each Railway environment has four services: **app** (`railway.toml`), **worker** (`railway.worker.toml`), **PostgreSQL**
and **Redis** (Railway templates). The owner runs and pays for the project (ENG-Q-03) on the Pro plan (D-039, superseding
Hobby). Volume backups and point-in-time recovery are turned on if Pro offers them; until a PITR restore is drilled,
recovery rests on the nightly off-site dump (RPO ≤ 24 h; E18-S03).

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
| `REDIS_URL` | app, worker | required because the start scripts default to `CACHE_STRATEGY=redis` and `QUEUE_STRATEGY=async`; `CACHE_REDIS_URL` / `QUEUE_REDIS_URL` override it per subsystem; the rate limiter reads only `REDIS_URL` |
| `RATE_LIMIT_STRATEGY` | app, worker | `redis` (the start scripts' default): counters shared by instances and kept across deploys. On Railway anything else refuses to start (#738) |

Also set per environment (not checked at boot, but the feature they serve fails without them):

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | session and cookie signing secret, unique per environment |
| `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` | tenant data encryption fallback key; never change it on a running environment |
| `NEXT_PUBLIC_APP_URL`, `PLATFORM_PORTAL_BASE_URL` | same value as `APP_URL` |
| `SYSTEM_EMAIL_PROVIDER`, `RESEND_API_KEY`, `NOTIFICATIONS_EMAIL_FROM` | outbound e-mail (S12.6) |
| `OM_ENABLE_ENTERPRISE_MODULES=false` | no effect since the enterprise package was removed (ADR-023, #466); keep it false so a reinstalled package stays off |
| `DEMO_MODE=false`, `SELF_SERVICE_ONBOARDING_ENABLED=false` | no demo widgets, no self-service tenants |
| `OM_PASSWORD_MIN_LENGTH=12`, `OM_PASSWORD_REQUIRE_DIGIT=false`, `OM_PASSWORD_REQUIRE_UPPERCASE=false`, `OM_PASSWORD_REQUIRE_SPECIAL=false` | the password policy (#747, see *Password policy* below); app and worker. Unset, the platform default applies: 6 characters with a digit, an upper-case letter and a special character |
| `OM_INIT_SUPERADMIN_EMAIL`, `OM_INIT_SUPERADMIN_PASSWORD`, `OM_INIT_ADMIN_EMAIL`, `OM_INIT_EMPLOYEE_EMAIL` | only for the one-time initialisation below; remove them afterwards. Unset, `yarn initialize` creates a `superadmin` account at the platform's demo domain `acme.com` with the password `secret` |
| `VEREINO_CLUB_DOMAIN` | optional; the club domain of an instance with many clubs (see *Club addresses* below). Unset: one club per instance |
| `RATE_LIMIT_STRATEGY=redis` | the app's request limits (per route, per club) count in Redis, so every app replica shares them; with the default `memory` each process counts alone (many-clubs spec DD-M10, #633) |
| `VEREINO_CLUB_RATE_LIMIT_POINTS`, `VEREINO_CLUB_RATE_LIMIT_DURATION` | optional; each club's budget of authenticated API requests, default 600 per 60 s; `0` points switch it off. Tune from the capacity report ([`capacity.md`](capacity.md)) |
| `VEREINO_HOME_CLUB_SLUG` | **deprecated**; the public slug of the one club of an instance without `VEREINO_CLUB_DOMAIN`, which `/` leads a guest to. Ignored once `VEREINO_CLUB_DOMAIN` is set; kept as the single-club fallback |
| `VEREINO_INSTANCE_ID` | optional; the id of this deployment that Vereino Enterprise licence keys are bound to (one for the shared cloud, its own for each dedicated instance). See *Enterprise licence keys* below |
| `VEREINO_LICENCE_KEYS`, `VEREINO_LICENCE_KEYS_FILE` | optional, sealed; the installed Enterprise licence keys. Unset: every Enterprise feature is off |

| `RATE_LIMIT_TRUST_PROXY_DEPTH` | the number of proxies in front of the app, **measured** per environment (see *Rate limits* below). Unset or `0` behind Railway's proxy, every client shares one counter: one client can block sign-in for everyone. The app starts but warns at boot |
| `RATE_LIMIT_ENABLED` | leave unset (on). On Railway `false` refuses to start |

Never set in staging or production: `OM_TEST_MODE` (on Railway the boot check refuses it), `OM_INTEGRATION_TEST` (it switches rate limits off; on Railway the boot check refuses it), `OM_AUTOLOGIN_*`, `OM_ALLOW_DEV_AUTH_SECRET`.
No `VEREINO_*` variable is required at boot yet; a new one is added to the boot check, to `.env.example` and to this
table in the same pull request.

## Rate limits

Railway's edge has no configurable rate limiting, so every limit is the app's (#738; inventory of the routes and their
limits: `docs/compliance/asvs-checklist.md` → *Sessionless route inventory*). There is no edge proxy in front of the
app until a trigger of D-043 fires; an attack the app's limits cannot absorb follows [`edge-proxy.md`](edge-proxy.md),
which also says how to measure the depth below again behind a proxy. The platform limiter keys a client by its
address, which it reads from `X-Forwarded-For` only as deep as `RATE_LIMIT_TRUST_PROXY_DEPTH` allows: with `0` (the
default) it trusts no header and every client falls into one shared counter.

Measure the depth on each environment, never assume it:

1. Deploy with the depth unset. The boot log warns `RATE_LIMIT_TRUST_PROXY_DEPTH is unset or 0`.
2. From your machine, open a public club page or call `GET /api/foundation/identity/providers` once without and once
   with a made-up header: `curl -s -o /dev/null https://<host>/api/foundation/identity/providers` and the same with
   `-H 'X-Forwarded-For: 192.0.2.1'`.
3. In the app logs find `Client address unresolved behind a proxy` (component `sessionless-limits`, once per
   `forwardedEntries` value; no address is logged). `forwardedEntries` of the request without the header is the number
   of proxies that appended an address: that is the depth. When the request with the made-up header shows one entry
   more, the proxy appends to the header, and the made-up entry is never trusted at that depth; when it shows the same
   number, the proxy replaces the header, and the depth is the same.
4. Set `RATE_LIMIT_TRUST_PROXY_DEPTH` to that number on the app and the worker, redeploy, and check that the boot
   warning is gone.
5. Prove it: from two networks (for example a phone on mobile data and a laptop), sign in with a wrong password on one
   until it answers 429; the other still signs in. Restart the app service (or redeploy) and check that the first
   client still gets 429 until `Retry-After` passes — the counters live in Redis. Record the depth and both results in
   a run log (`.ai/runs/`).

When Redis cannot be reached the platform limiter keeps counting per process in memory, which resets on every deploy;
the app logs `Rate limiter store unreachable` once per outage (component `rate-limit-store-watch`) and
`Rate limiter store reachable again` when it is back. A refusal is logged as `Sessionless request over its rate limit`
with the limiter key prefix only.

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
10. [ ] The per-club setup commands the release notes name are run for every club, every `schedules` entry `true`;
    `yarn mercato foundation club-jobs status` shows no `failing` club.
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

Before a change to the `Dockerfile`, the start scripts or the server packages reaches staging, the CI job
`image-smoke` runs `scripts/image-smoke.sh`: it builds the `runner` stage and runs steps 2–4 above, `yarn initialize`
and the worker against throwaway PostgreSQL and Redis containers, with the start scripts' default
`CACHE_STRATEGY=redis`. Run it locally the same way (`scripts/image-smoke.sh`; Docker and Node needed) (#727).

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
2. Prepare the maintainers' accounts. `yarn initialize` is the platform's `mercato init`: without the variables below
   it creates the super-administrator `superadmin` at the platform's demo domain `acme.com` with the password `secret`,
   skipping the password policy for it, and it always creates two more accounts, `admin` and `employee` at the same
   demo domain (#747, ASVS V6.3.2;
   checked on a throwaway database 2026-11-25). On the app service set, as sealed variables:
   - `OM_INIT_SUPERADMIN_EMAIL`: the address of the maintainer who signs in as super-administrator (a mailbox the
     maintainers control; never an `@acme.com` or a made-up address);
   - `OM_INIT_SUPERADMIN_PASSWORD`: a generated password (`openssl rand -base64 24`), stored in the team password
     manager first;
   - `OM_INIT_ADMIN_EMAIL` and `OM_INIT_EMPLOYEE_EMAIL`: two more addresses of the maintainers' own mailbox (for
     example plus-addresses of it), so that the two extra accounts never carry an `@acme.com` address.

   Leave `OM_INIT_ADMIN_PASSWORD` and `OM_INIT_EMPLOYEE_PASSWORD` unset: with `NODE_ENV=production` the platform gives
   the two extra accounts random passwords.
3. From a Railway shell on the app service (`railway ssh` or the service's shell), run `yarn initialize --no-examples`
   once. It refuses to run on a database that already has users. It prints the three accounts with their passwords
   in a closing box: copy nothing from it, and clear the terminal afterwards. Never pass `--password=` on the command
   line instead of the variable (it lands in the shell history).
4. Remove the four `OM_INIT_*` variables. Sign in as the super-administrator, open **Settings → Users** and delete the
   two extra accounts of step 2; then run the [default account check](#default-account-check).
5. Create each club, starting with the demo club, with `yarn mercato club_core create-club` ([`clubs.md`](clubs.md));
   it runs the per-club setup below itself.
6. On `production`: run the [lock-down checklist](#lock-down-production) and record the pass before the first real
   club data is entered.

### Default account check

Run it on every environment after its first deploy, and on staging and production once for the environments that were
initialised before #747. From a Railway shell on the app service:

```bash
yarn mercato auth list-users | grep -iE '@acme\.com|^[^|]*\| *(admin|employee)@'
```

The command lists every user with its e-mail (decrypted; it needs the environment's
`TENANT_DATA_ENCRYPTION_FALLBACK_KEY`, which the app service has); the filter prints only the platform's default
accounts. It
must print nothing. For each line it prints: delete the account in **Settings → Users** when nobody uses it; otherwise
set a generated password at once (`yarn mercato auth set-password --email <e-mail> --password "$(openssl rand -base64
24)"`; the command echoes its arguments, password included, so clear the terminal and keep nothing; the owner then
sets a password of their own through the sign-in page's password reset) and move the owner to a personal account. Record the result, without e-mails of real people, in the run log of
the deploy or the lock-down pass.

### Password policy

The platform checks a new password against four variables (`OM_PASSWORD_*`, table above) on the server: the user
create and edit, profile and password-reset API routes and `mercato auth set-password`. Production and staging use
the policy of ASVS 5.0 level 2 (V6.2.1, V6.2.5): **at least 12 characters, no character-class rules**. Set the four variables on the app and the worker of each environment. Two
limits remain (`docs/compliance/asvs-requirements.md`, V6.2.x):

- The platform's browser forms (change password, password reset, user create and edit) read the policy in the browser,
  where these server variables are not set, so they keep showing and checking the platform default (a digit, an
  upper-case letter and a special character) until the app-owned check of #779 replaces them.
- No check against common or breached passwords or against club words exists yet (#779).

### Staff second factor

Club administrators, treasurers and the platform super-admin sign in with Google or with the password and a six-digit
code e-mailed to the account's address (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, #736). It holds only
while these are true:

- **Transactional e-mail works.** The code is the fallback's only channel; while the provider is down the sign-in of
  staff without Google answers 503 and the logs show `foundation.second_factor.unavailable` (fail closed). The
  operator's own sign-in needs a working mailbox too.
- **`OM_AUTOLOGIN_*` stays unset** (variables above): autologin issues a session without any factor.
- **The smoke account holds no staff role**: a club administrator or treasurer gets a code instead of a session, so
  the `no-store` check could not sign in.

The release that ships phase 1 (and any environment set up before it) runs, in this order:

1. `yarn mercato foundation sync-role-acls-if-changed` (the [role ACL sync](#role-acl-sync), part of every deploy):
   the club administrator and treasurer roles of existing clubs get `foundation.second_factor.required` and the
   administrator `foundation.second_factor.reset`. Until it ran, existing clubs are not challenged.
2. For each club: `yarn mercato foundation second-factor end-sessions --tenant <tenantId> --org <organizationId>`. It
   ends the sessions of every user holding the requirement, so a session issued before the release cannot outlive it
   (Q-2F05); it prints the counts and a repeat finds nothing. The platform super-admin's tenant is one of these runs.

**A lost factor.** A club administrator resets another staff member on the person record (Account → Sign-in
methods → Reset second factor) after verifying them, for example by calling back the number on the record. For the
last administrator of a club, or the super-admin, the operator verifies the person by their own procedure and runs:

```bash
yarn mercato foundation second-factor reset --tenant <tenantId> --org <organizationId> \
  --email <the person's e-mail> --note "<how the person was verified>"
```

It removes the person's sign-in identities and ends all their sessions; the note goes to the command log. Record the
reset, without the person's e-mail, in the run log of the support case.

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

### Per-club jobs: one sweep per job type

Every club runs the same scheduled jobs in its own time zone. Since #629 (many-clubs spec phase 1, DD-M04) they run
on **one sweep schedule per job type**, whatever the number of clubs: the sweep wakes every 5 minutes, finds the
clubs whose run is due in `foundation_club_jobs` and enqueues one job per club on the module's own queue. A daily job
runs at its local time plus a stable offset of 0–20 minutes per club (the clubs do not all start at once); an interval
job keeps a stable slot inside its interval. A club's time-zone change moves its daily jobs at once. A failed run of
one club is logged (`"Club job run failed; retried later"`), stored as an error code and retried after 15 minutes;
the other clubs are not affected.

| Module | Job type | When (club's local time) |
|---|---|---|
| `foundation` | `foundation:dispatch-sweep` | every 2 minutes, one system-wide sweep over the clubs with queued e-mail (not per club) |
| `people` | `people:life-cycle`, `people:sync-role-expiry`, `people:retention-sweep`, `people:purge-import-rows` | 01:30, 02:00, 03:00, 04:00 |
| `activities` | `activities:generate-occurrences`, `activities:send-declaration-reminders` | 03:00, 18:00 |
| `activities` | `activities:expire-guardian-confirmations`, `activities:warn-unassigned-sessions`, `activities:purge-declaration-links` | every 15 minutes, 15 minutes, daily |
| `facilities` | `facilities:maintenance-reminders` | 06:00 |
| `facilities` | `facilities:rental-lifecycle`, `facilities:expire-requests`, `facilities:purge-rental-links` | every 15 minutes, 15 minutes, daily |
| `payments` | `payments:verify-invariants`, `payments:generate-charges`, `payments:overdue-reminders` | 03:00, 06:00, 09:00 |
| `payments` | `payments:reconcile-checkouts`, `payments:close-order-campaigns`, `payments:purge-order-links` | every 15 minutes, 15 minutes, daily |

A club's setup (`seedDefaults`, or the idempotent `yarn mercato <module> set-up-club --tenant <id> --org <id>` of
`activities`, `payments` and `facilities`, and `people bootstrap-admin`) creates its job state; it prints a
`schedules` entry per job, which must be `true`. `people:life-cycle` is set up for an existing club only by
`yarn mercato people life-cycle --register-schedule` after the confirmed dry run. The same holds for the former
participants' retention sweep (club spec REQ-041; #471): its first real run anonymises everyone who left the club
`former_participant_retention_months` ago or earlier (default 12), so run
`yarn mercato people retention-sweep --tenant <id> --org <id> --dry-run` first and, when the club confirms the counts,
`yarn mercato people retention-sweep --tenant <id> --org <id> --register-schedule` (it prints
`scheduleRegistered: true`).

**Moving an instance onto the sweeps (once, after the release with #629; Ask First on staging and production).**
Until then each job type runs per club on its old schedules. Per job type, or for all of them:

```bash
yarn mercato foundation retire-club-schedules --dry-run            # counts only
yarn mercato foundation retire-club-schedules --job payments:generate-charges
yarn mercato foundation retire-club-schedules                       # every job type
yarn mercato foundation club-jobs status                            # sweep: true, perClubSchedules: 0, failing: 0
```

The command creates the job state of every club that has the old schedule, registers the job type's sweep and then
removes the per-club schedules; it is idempotent. Afterwards `scheduled_jobs` holds 20 system-scope rows and none per
club, and a club set up later gets no per-club schedule. Rollback per job type (it re-registers the per-club schedule
for every club with job state and removes the sweep):

```bash
yarn mercato foundation restore-club-schedules --job payments:generate-charges
```

**Operator tools.** `yarn mercato foundation club-jobs status [--job <key>]` prints per job type whether its sweep
runs, the per-club schedules left and the clubs, due, leased and failing counts. `yarn mercato foundation club-jobs
sweep [--job <key>]` runs one sweep now. One club's job still runs by hand without the sweep, as before, for example
`yarn mercato payments run-job --job generate-charges --tenant <id> --org <id>`.

## Lock down production

The Railway settings that keep the production environment closed (E25-S01, #735; epic #734). Railway encrypts data at
rest and in transit, but on Pro every member of the workspace reaches every project and environment in it, project and
workspace tokens bypass two-factor sign-in, and the workspace audit log is kept 30 days (D-039). This list closes what
the application cannot.

**When.** The owner runs the whole list once on the production environment **before the first real club data**, and
again after every change of the Railway plan, of the workspace members or roles, or of the services of the project
(a service added, removed or renamed, a database template replaced). Each pass is recorded in a run log
(`.ai/runs/YYYY-MM-DD-production-lock-down.md`), item by item, **without values**: names of variables, services and
tokens only, never a secret, a URL with a password or a token. The first pass is recorded in
`.ai/runs/2026-11-25-issue-735-production-lock-down.md`.

Out of scope here (settled elsewhere): signing Railway's DPA, volume backups and PITR, and two-factor enforcement for
the workspace (D-039, `docs/compliance/processors.md` P-1).

### Lock-down checklist

| # | Item | How to check and fix | Source (read 2026-11-25) |
|---|---|---|---|
| L-1 | **No public TCP proxy** on PostgreSQL or Redis in `production` | Each database service → *Settings* → *Networking*: no *Public Access* / *TCP Proxy* entry; delete one if present. Railway databases are private unless public access is added, which creates the proxy and its `DATABASE_PUBLIC_URL` | [PostgreSQL](https://docs.railway.com/guides/postgresql), [TCP proxy](https://docs.railway.com/networking/tcp-proxy) |
| L-2 | The app, the worker and the backup job reach the databases **only over `*.railway.internal`** | Their `DATABASE_URL` and `REDIS_URL` are references to the database service's private variables (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`), never `DATABASE_PUBLIC_URL` or a proxy host; the resolved host ends in `.railway.internal` (check the service's *Variables* tab, never copy the value out). Each environment has its own isolated private network over WireGuard | [Private networking](https://docs.railway.com/reference/private-networking) |
| L-3 | Every production **secret is a sealed variable** | `JWT_SECRET`, `AUTH_SECRET`, `TENANT_DATA_ENCRYPTION_FALLBACK_KEY`, `RESEND_API_KEY`, `VEREINO_LICENCE_KEYS`, the `BACKUP_S3_*` keys and any provider key added later: *Seal* in the variable's menu. A sealed value is given to builds and deployments but never shown in the UI or returned by the API or `railway variables` / `railway run`, and it cannot be unsealed. Keep a copy of `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (it must never change) and of the licence keys in the team password manager before sealing | [Sealed variables](https://docs.railway.com/guides/variables) |
| L-4 | **No secret shared with staging** | Every production secret has its own value, generated for production (`openssl rand -hex 32` for the signing secrets); no project-level shared variable (`${{shared.…}}`) holds a secret; staging never references a production service | [Variables](https://docs.railway.com/guides/variables) |
| L-5 | **PR environments are off** for the project that holds production | *Project Settings* → *Environments*: PR environments disabled. A PR environment would deploy unreviewed code into the project that holds club data | [Environments](https://docs.railway.com/guides/environments) |
| L-6 | **Token inventory**: production holds only the tokens the maintainers need | Project tokens (*Project Settings* → *Tokens*; one environment each) and workspace tokens (account settings → *Tokens*; the whole workspace) keep working without two-factor sign-in. List every token that can reach production in the [token inventory](#token-inventory) with its owner and purpose; revoke every token that is not on it | [Public API](https://docs.railway.com/reference/public-api), [Two-factor enforcement](https://docs.railway.com/access/two-factor-enforcement) |
| L-7 | **CI and the build agents hold no Railway token for production** | No Railway token in the GitHub repository's or organisation's Actions secrets, in a GitHub environment, or on the machines of the build agents (Cezar runs, sandboxes). Staging deploys from GitHub through Railway's own integration, not through a token; the backup job runs inside Railway ([`backups.md`](backups.md)) | — (repository rule) |
| L-8 | **Workspace members** | The workspace's member list and roles match the people the owner decided may reach production (D-039: every role reaches every project of the workspace). When a member leaves, revoke the tokens they own the same day (L-6) | [Workspaces and roles](https://docs.railway.com/projects/workspaces) |
| L-9 | **Audit log export** is in place | The [monthly export](#audit-log-export) ran within the last 30 days | [Audit logs](https://docs.railway.com/enterprise/audit-logs) |

Database access for a maintainer (a restore, a one-off query) goes through a shell inside the environment (`railway
ssh` on the app service), not through a proxy. If a restore really needs a public proxy, add it, use it and delete it
in the same session, and write both times in the incident note.

### Token inventory

Kept in the team password manager next to the tokens themselves, never in this repository. One row per token that can
reach production:

| Token name (as shown in Railway) | Type (project / workspace / account) | Reaches | Owner | Purpose | Created | Next review |
|---|---|---|---|---|---|---|

Rules: a project token is preferred over a workspace token because it reaches one environment only; a token has one
owner and one purpose; a token whose owner leaves, or whose purpose is gone, is revoked the same day; the inventory is
reviewed at every lock-down pass. An account token reaches every workspace of the account and is never created for
production work.

### Audit log export

Railway keeps the workspace audit log 30 days on Pro (48 hours on Hobby, 18 months on Enterprise), so an
investigation that reaches further back needs an exported copy. An Admin of the workspace exports it **once a month,
within 30 days of the previous export**, and at once when an incident starts ([`incident.md`](incident.md)).

Export through Railway's GraphQL API (`https://backboard.railway.com/graphql/v2`, query `auditLogs`), with a token
held only for the export (listed in the [token inventory](#token-inventory)) given through an environment variable,
never on the command line or in a file in the repository:

```bash
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_AUDIT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"query($w:String!,$after:String){auditLogs(workspaceId:$w,after:$after){edges{node{id eventType createdAt projectId environmentId payload context}}pageInfo{endCursor hasNextPage}}}","variables":{"w":"<workspace id>","after":null}}' \
  > audit-YYYY-MM.page-1.json
```

Repeat with `"after"` set to the previous page's `pageInfo.endCursor` while `hasNextPage` is true. Railway's page
documents the query and its fields but not its pagination arguments: on the first export confirm the argument names
against the API schema and correct this command here if they differ.

The events identify the workspace members who acted (the `payload` and `context` fields), so the pages are personal data
of the maintainers: they go to the maintainers' storage (the team password manager or the private incident folder), are kept
12 months, and never enter this repository, an issue, a log or a transcript. The run log of the export records the
month, the number of events and where the file was stored, nothing else.

## Enterprise licence keys

Vereino Enterprise features are switched on per tenant by a licence key (`.ai/specs/2026-11-23-vereino-enterprise-package.md`,
DD-E04, DD-E05, DD-E07; #649). A key is `vereino-lic.v1.<payload>.<signature>`, signed offline by the owner with
Ed25519 for one instance, one tenant, a list of features and an expiry; the app verifies it offline against the public
keys compiled into `foundation/lib/licence-public-keys.ts`. No key, no variable and no Enterprise package: every
Enterprise feature is off and the core works exactly as before.

1. Set `VEREINO_INSTANCE_ID` once per environment (for example `cloud-eu-1`, `staging-1`); a key signed for another
   instance id is rejected as `wrong_instance`. Never reuse an instance id for another deployment.
2. Add the key to `VEREINO_LICENCE_KEYS` as a **sealed** Railway variable (newline- or comma-separated with the keys
   already there), or to the file named by `VEREINO_LICENCE_KEYS_FILE`, on the app and the worker. Keys name customers:
   never paste one into an issue, a pull request, a log or a run log; refer to a key by its `lid`.
3. Restart (a redeploy does it). Keys are read once at boot; the app logs
   `[foundation] licence keys: <n> valid of <m> installed; rejected: <lid> (<reason>)` — never the key.
4. Check from a shell on the app service (`railway ssh` or the service's shell): `yarn mercato foundation licence-status` prints one JSON line: the instance id,
   per valid key its `lid`, tenant, features with their state (`on`, `read_only`) and the expiry, and the rejected keys
   by `lid` (or position) and reason (`unknown_kid`, `bad_signature`, `malformed`, `invalid_payload`, `wrong_prefix`,
   `wrong_instance`). Without keys it prints `"message":"no licence keys installed"`.

Expiry: a feature stays `on` until `expiresAt` plus the key's grace period (14 days), with a renewal notice from
`expiresAt`; after that it is `read_only` — the club still reads and exports its data, writes answer 409
`enterprise_feature_read_only`. **Keep an expired key installed**: removing the last key of a tenant turns its features
`off` (404 `enterprise_feature_disabled`), so remove it only after the customer's export or termination. A renewal is a
new key added next to the old one; the key whose grace period ends last wins.

Staging and production never trust the committed test key pair (`packages/app/.ai/qa/fixtures/licence-test-key-pair.json`,
kid `test-…`): a test-signed key shows as `unknown_kid` there. That is the exit check of phase 1a.

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
