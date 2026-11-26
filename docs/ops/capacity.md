# Capacity of one instance (cell)

What one Vereino instance carries at the evening peak, where it breaks first, and what to add for 50, 300 and 1,000
clubs (many-clubs spec [`2026-11-22-vereino-many-clubs-one-instance.md`](../../.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md),
phase 5, TEST-M09; issue #633). The scaling unit beyond one instance is a **cell** ([`cells.md`](cells.md)).

> **Where the numbers come from.** Measured on **cezar-ws in Docker**, not on Railway (owner's decision of
> 2026-11-25 on #633): local PostgreSQL 17, Redis 7 and the app built from the branch of #633 (`main` of 2026-11-25
> plus the per-club limits). They approximate Railway: the containers were capped to sizes a Railway service can
> have, but the disk, the network (everything on one host, no TLS, no proxy hop) and the noisy neighbours differ.
> Treat them as the right order of magnitude and as a ranking of bottlenecks, not as Railway's exact latencies.
> Synthetic data only; the stack was removed after the run.

## Summary

| Question | Answer |
|---|---|
| Evening peak one app process carries (2 vCPU) | **≈ 40 requests/s** of the evening mix with p95 ≈ 0.2 s; above that requests queue and p95 grows to seconds |
| 100 clubs at ≈ 100 requests/s | carried by **3 app replicas** (106 req/s, p50 76 ms) but **p95 3.4 s** on the API, 0.4 % failed: every replica and the 2-vCPU database were saturated. Needs **4 replicas and a 4-vCPU database** for p95 < 0.8 s |
| First bottleneck | **The app's CPU** (one Node.js event loop per process). PostgreSQL was at 20–28 % at 40 req/s and becomes the second bottleneck near 100 req/s on 2 vCPU |
| Found and fixed on the way | A **connection-pool deadlock** on the two hottest writes (declaring an absence, checking off attendance): at 50 req/s every API call waited 60 s for a connection and half failed. Fixed in #633 for these two commands; the other commands keep the pattern (follow-up) |
| 06:00 job burst | 2,356 club jobs (124 clubs × 19 job types) forced due at once: drained **≈ 75 s after the next sweep tick**, worker ≤ 1 vCPU, database ≤ 7 % |
| Deploy | Pre-deploy with unchanged role defaults **3.9 s**; a forced role-ACL sync over 124 tenants **23.5 s** (≈ 0.19 s per club → ≈ 3 min at 1,000 clubs, under the 10-minute target) |
| Database size | 100 clubs: **950 MB** after seeding, **1.7 GB** after the load runs (audit and access logs, search tokens) |
| Indexes | No hot query scans across clubs; no index added (plans below) |
| Connection pooler | **Not needed up to 3–4 app replicas**; sizing rule below. A pooler (PgBouncer, transaction mode) becomes necessary with the 300-club step |

## Setup

| Part | Size | Notes |
|---|---|---|
| app | 2 vCPU, 3 GB (1 replica; 3 replicas behind nginx for the 100 req/s run) | `sh ./scripts/railway-start.sh`; `DB_POOL_MAX` default 20 |
| worker | 1 vCPU, 2 GB | `sh ./scripts/railway-worker.sh` (`yarn mercato queue worker --all`) |
| PostgreSQL | 17 (`pgvector/pgvector:pg17-trixie`), 2 vCPU, 4 GB, `shared_buffers=1GB`, `max_connections=200` | `pg_stat_statements` and `auto_explain` on |
| Redis | 7, 1 vCPU, 1 GB, `appendonly yes`, `noeviction` | queue (BullMQ, `QUEUE_STRATEGY=async`) and rate-limit counters (`RATE_LIMIT_STRATEGY=redis`) |
| Cache | `CACHE_STRATEGY=sqlite` on a volume shared by app, worker and CLI | the Redis cache client fails in the production bundle — see *Problems found* |
| Limits | request limits on; club budget 600 requests/min; e-mail delivery off (`OM_DISABLE_EMAIL_DELIVERY=1`) | e-mail fairness is proven by TEST-M08 instead |

The app, worker and CLI ran the Dockerfile's **builder** stage: the deployed **runner** stage cannot run any `yarn
mercato` process (see *Problems found*).

**Data** (`scripts/vereino-capacity-seed.mjs`): 100 clubs created with `club_core create-club`, each with a section, a
place, 6 groups, a coach, 150 participants with their guardians imported through the people import (with groups),
a weekly training per group (today's session open for check-off), a monthly fee per group with this month's charges,
and 10 guardian accounts. 24 smoke-test clubs from the script's trial runs stayed in the database (124 tenants). In
total: 34,441 persons, 11,220 sessions, 16,500 charges, 1,297 accounts. Seeding took 31 minutes (6 clubs at a time,
≈ 18 s per club).

**Load** (`scripts/vereino-capacity-load.mjs peak`): an open model (arrivals at a fixed rate, whatever the answers
take) of the evening: guardians open their calendar (18 %), report or withdraw an absence (15 %), open their charges
(12 % + 5 % summary) and the member pages `/club` and `/club/calendar` (13 %); coaches read (12 %) and save (6 %) the
attendance list of a running session; administrators open the charges list (9 %), the payments dashboard (5 %) and
the `/backend/payments/charges` page (5 %). One request per scenario, at a random club and user; the attendance save
reads the list first for its version. The issue's assumption, about 1 request/s per club at the evening peak, is the
load model behind the scaling steps.

## Results

### One app process (2 vCPU)

| Arrival rate | Delivered | p50 | p95 | p99 | Failed | App CPU | DB CPU |
|---|---:|---:|---:|---:|---:|---:|---:|
| 20 req/s | 21.2 | 27 ms | 48 ms | 77 ms | 0 | 61 % | 18 % |
| 25 req/s | 26.4 | 25 ms | 48 ms | 78 ms | 0 | 74 % | 19 % |
| 30 req/s | 32.0 | 26 ms | 61 ms | 111 ms | 0 | 87 % | 23 % |
| 35 req/s | 37.1 | 28 ms | 83 ms | 136 ms | 0 | 97 % | 26 % |
| 40 req/s | 42.5 | 45 ms | 205 ms | 341 ms | 0 | 113 % | 28 % |
| 50 req/s | 41 (saturated) | 14.8 s | 24.7 s | 31.5 s | 0 (1,675 arrivals dropped by the load cap) | ≈ 150 % | 30 % |

CPU is the container's share (100 % = one vCPU; the Node.js main thread is one of them). p95 of the slowest route at
40 req/s: the attendance save, 353 ms; member pages ≤ 173 ms. One run at 25 req/s, right after the overload runs,
stalled for about a minute (p95 31 s, no errors) and did not repeat in a second run (above).

### Three app replicas, 100 req/s, 5 minutes

| Route | req/s | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| guardian calendar | 18.1 | 55 ms | 3.2 s | 4.1 s |
| guardian declares an absence | 15.0 | 68 ms | 3.4 s | 4.7 s |
| guardian charges / summary | 11.9 / 5.0 | 65 / 56 ms | 3.8 / 3.6 s | 5.4 / 5.8 s |
| coach reads / saves attendance | 18.1 / 5.9 | 72 / 112 ms | 3.9 / 4.9 s | 4.8 / 6.1 s |
| admin charges list / dashboard | 8.9 / 4.8 | 95 / 56 ms | 3.6 / 2.7 s | 4.7 / 3.5 s |
| member pages (`/club`, `/club/calendar`, `/backend/payments/charges`) | 18.4 | 78–98 ms | 394–433 ms | 576–730 ms |
| **all** | **105.9** | **76 ms** | **3.4 s** | **4.8 s** |

125 of 31,759 requests failed (0.4 %), some of them at the test's nginx (`worker_connections` too low), the rest 500s
under saturation. Each replica ran at ≈ 115 % CPU (its limit), PostgreSQL at 79 % on average with peaks of 97 % of its
2 vCPU, and 102 server connections were open (3 × 20 app pools, the worker, the CLI). Member pages kept p95 < 0.5 s:
the spec target (*p95 of member pages under 800 ms*) holds for pages; the API needs one more replica and a larger
database.

### Before the fix: the pool deadlock

The first 50 req/s run, before `d321cb55`, failed half of all API calls: 1,036 of 2,020 failed or timed out, p50
62 s. `pg_stat_activity` showed 10 app connections `idle in transaction` right after `begin`, app CPU 0 %. The
declaration and check-off commands opened their write transaction (one pooled connection) and then resolved the
session scope on a **second** pooled connection; with as many concurrent writes as pool connections, every one waited
for a connection none would release until the 60 s acquire timeout — the deadlock #549 fixed for "Accept cash".
`activities.attendance.declare` and `activities.attendance.mark` now prefetch the scope before the transaction, like
cash. Every other command that resolves the scope inside its transaction can still deadlock under concurrency; none
of them is on the evening's hot path, but a club's burst of the same write (an import, a bulk action) can hit it.

### Cold start

Right after the app starts, 20 req/s gave p95 32 s for the first minute (every route loads and compiles its modules
and fills its caches at once, and the first requests queue behind it); afterwards p95 was 48 ms. A deploy at the
evening peak would show this to every club: keep deploys in the release window ([`deploy.md`](deploy.md)), and warm a
new replica (a few requests per route) before it takes traffic.

### The 06:00 burst

`vereino-capacity-load.mjs burst` set every club's job of every type due at once (2,356 rows of
`foundation_club_jobs`, after `foundation retire-club-schedules` moved the stack onto the sweeps). Nothing ran until
the next sweep tick (≈ 225 s, the sweep interval), then the whole backlog drained in ≈ 75 s with no failed club: the
worker at 32 % of its vCPU on average (97 % peak), PostgreSQL ≤ 7 %. With DD-M05's 0–20-minute offset the real
06:00 load is spread over 20 minutes; it is far from a limit at 100 clubs and stays linear in the number of clubs
(≈ 1,000 clubs: ≈ 12 minutes of one worker at the same rate, inside the offset window).

### Deploy

| Step | 124 tenants |
|---|---|
| `scripts/railway-predeploy.sh` (no migration pending, role defaults unchanged → sync skipped) | 3.9 s |
| `foundation sync-role-acls-if-changed --force` | 23.5 s |

### Database

| | After seeding 100 clubs | After the load runs |
|---|---|---|
| Database size | 950 MB | 1.7 GB |
| Largest tables | `search_tokens` 583 MB, `access_logs` 297 MB, `action_logs` 209 MB | `access_logs` 680 MB, `search_tokens` 583 MB, `action_logs` 253 MB |

Club data proper is small (`people_persons` 22 MB, `payments_charges` 10 MB for 100 clubs). The audit and access
logs grow with traffic, not with clubs: their retention (`AUDIT_LOGS_*_RETENTION_*`) decides the size. Expect
roughly 10–20 GB at 1,000 clubs.

**Hottest statements** (`pg_stat_statements`, 100 req/s on 3 replicas, 5 minutes):

| Statement | Calls | Mean | Note |
|---|---:|---:|---|
| `encryption_maps` lookup (three variants) | 1,143,000 | 0.01–0.02 ms | ≈ 36 per request: the platform reads the encryption map per entity per request, uncached. The largest share of database calls and of app CPU spent on round trips |
| `role_acls` by tenant and roles | 59,000 | 0.17 ms | RBAC per request |
| `access_logs` insert (batch) | 2,663 | 0.97 ms | access log of personal-data reads |
| `activities_occurrences … for update` | 4,461 | 0.25 ms (max 258 ms) | the attendance save locks its session: concurrent coaches of one session wait for each other |
| `users`, `sessions`, `club_core_club_settings` by id | 59,000–87,000 | 0.01 ms | session check and club settings per request |

**Cross-club (system-scope) statements** — `EXPLAIN ANALYZE` on the seeded data:

| Statement | Plan | Time |
|---|---|---|
| job claim (`claimDueClubJobs`, DD-M07 (a)) | bitmap index scan `foundation_club_jobs_key_due_idx` | 0.06 ms |
| due deliveries (`clubsWithDueDeliveries`, DD-M07 (b)) | index scan `foundation_deliveries_status_next_attempt_idx` | 0.02 ms |
| a club's e-mail backlog (`clubEmailBacklogUntil`, new in #633) | index scan backward `foundation_deliveries_status_next_attempt_idx`, filters other clubs' paced rows | 0.3 ms with 5,000 queued rows of another club |

No hot query scans across clubs, so no index was added. A per-club index `(organization_id, status, channel,
next_attempt_at)` for the backlog read was tried: the planner kept the status index (both under 0.5 ms), so it was not
kept. Revisit if `clubEmailBacklogUntil` shows up in `pg_stat_statements` once many clubs send large dispatches.

## Connection pool: why no pooler yet

Each app replica and the worker hold up to `DB_POOL_MAX` connections (default 20; the worker fits its job concurrency
to `OM_WORKERS_DB_CONNECTION_BUDGET`, default the same). Keep

```
replicas × DB_POOL_MAX + worker budget + 10 (CLI, pre-deploy, backups) ≤ PostgreSQL max_connections
```

Railway's PostgreSQL template allows 100 connections: 3 replicas × 20 + 20 + 10 = 90 fits. The 100 req/s run peaked
at 102 server connections with an extra CLI container, so at 4 replicas lower `DB_POOL_MAX` to 15 (4 × 15 + 20 + 10
= 90) — the pool was never the limit once the deadlock was fixed: the app's CPU was. Beyond 4–5 replicas (the 300-club
step) put **PgBouncer in transaction mode** in front of PostgreSQL (Vereino uses transaction-scoped advisory locks
only, `pg_advisory_xact_lock`, which transaction pooling keeps), or move to a managed PostgreSQL with a built-in pooler.
Adding PgBouncer is new infrastructure: Ask First (owner, 2026-11-23 and 2026-11-25 on #633).

## Per-club limits (DD-M10)

| Limit | Default | From the measurements |
|---|---|---|
| Authenticated requests per club (`VEREINO_CLUB_RATE_LIMIT_POINTS` / `_DURATION`) | 600 per 60 s | A club at the evening peak sends ≈ 1 request/s (60/min): 10× headroom. One club at its budget (10 req/s) takes a quarter of one replica, which ≥ 2 replicas absorb. Keep 600 |
| Running imports per club | 1 (people import commit and bank statement import share it; 409 `import_running`) | People import ≤ 1,000 rows, bank statement ≤ 2,000 entries (existing caps, under the spec's 5,000) |
| E-mail per club | 2 per second inside the process's 8 per second | TEST-M08: another club's mail leaves in the first round while one club sends 200 |
| Public routes | each route's own limit, keyed by client address **and club** | needs `RATE_LIMIT_TRUST_PROXY_DEPTH` set to Railway's proxy count; with the default 0 the client address is unknown and every visitor of a club shares one counter |

`RATE_LIMIT_STRATEGY=redis` makes the replicas share the counters ([`deploy.md`](deploy.md)).

## Scaling steps

The load model is the issue's: about 1 request/s per club at the evening peak, the mix above.

| Clubs | Peak load | App | Database | Redis, pooler | Other |
|---|---|---|---|---|---|
| **50** | ≈ 50 req/s | 2 replicas × 2 vCPU (one carries ≈ 40 req/s; the second is headroom and survives a replica restart) | 2 vCPU, 4 GB (≈ 0.5 GB data, ≈ 1 GB with logs) | Railway Redis; no pooler (2 × 20 + 20 + 10 = 70 connections) | Today's Railway setup; nightly dump (RPO 24 h) still acceptable while clubs are few and agree to it |
| **100** (measured) | ≈ 100 req/s | 4 replicas × 2 vCPU (3 were saturated at p95 3.4 s); `DB_POOL_MAX=15` | 4 vCPU, 8 GB (2 vCPU ran at 79–97 %) | no pooler (4 × 15 + 20 + 10 = 90) | — |
| **300** | ≈ 300 req/s | ≈ 10 replicas, or ≈ 5 after the per-request work is cut (cache the encryption maps and ACLs per process: ≈ 36 database round trips per request today) | 8 vCPU, 16–32 GB, **managed PostgreSQL with point-in-time recovery and a hot standby (HA)** | **PgBouncer** (transaction mode) or the managed provider's pooler; Redis with persistence and a replica | Move to managed PostgreSQL **at this step, before the 300th club**: a 24-hour RPO and a manual restore are no longer acceptable for hundreds of clubs, and one database host is a single point of failure for all of them |
| **1,000** | ≈ 1,000 req/s | Not one cell: **4 cells of ≈ 250–300 clubs** ([`cells.md`](cells.md)), each sized as the 300-club step | one managed PostgreSQL with PITR + HA per cell | per cell | Deploy time: ≈ 3 min of ACL sync per 1,000 tenants when role defaults change (DD-M11); the 06:00 sweep drains 1,000 clubs within its 20-minute offset window |

**When to move the database to a managed service with PITR and HA:** at the **300-club step** at the latest, and
earlier when either a club's agreement needs an RPO under 24 hours, or the database needs more than one 4-vCPU host.

## Problems found (follow-ups)

1. **The production image cannot run any `yarn mercato` process.** In the Dockerfile's `runner` stage, `yarn start`
   (`mercato server start`), the pre-deploy script and the worker fail with `Cannot find package 'react' imported from
   /app/packages/ui/src/emails/EmailLayout.ts`: the stage installs only `@vereino/app`'s dependencies, and
   `packages/ui` source loaded outside the Next bundle cannot resolve `react`. Check staging and production now.
2. **The Redis cache client fails in the production bundle.** With `CACHE_STRATEGY=redis` (the start scripts'
   default) the first cached read (RBAC) throws `Class constructor Redis cannot be invoked without 'new'` in
   `@open-mercato/cache`, and `/api/healthz` answers 503 for its Redis probe. The CLI and the worker are not affected.
3. **The pool deadlock of #549 remains in the other commands** that resolve the session scope inside their write
   transaction. Fixed here for the two hot evening writes; the generic fix (prefetch in `inWriteTransaction` /
   `authorizeScoped` for every command) is its own change.
4. **Per-request platform work**: ≈ 36 `encryption_maps` lookups and RBAC reads per request dominate database calls
   and app CPU; caching them per process is the cheapest capacity gain (upstream Open Mercato).
5. **`RATE_LIMIT_TRUST_PROXY_DEPTH`** is unset (0) in the deploy docs, so behind Railway's proxy every public-route
   limit counts all clients together.

## How to run it again

On a machine with Docker, from the repository root, never against a real or dev database:

```bash
docker build --target builder -t vereino-capacity-builder .     # see problem 1 for why not the runner stage
docker network create vereino-capacity-net
docker run -d --name vereino-capacity-db --network vereino-capacity-net -p 127.0.0.1:5463:5432 \
  -e POSTGRES_DB=vereino -e POSTGRES_USER=vereino -e POSTGRES_PASSWORD=<local> pgvector/pgvector:pg17-trixie \
  -c shared_preload_libraries=pg_stat_statements -c max_connections=200 -c shared_buffers=1GB
docker run -d --name vereino-capacity-redis --network vereino-capacity-net redis:7-alpine \
  redis-server --appendonly yes --maxmemory-policy noeviction
# app.env: DATABASE_URL, REDIS_URL, JWT_SECRET, AUTH_SECRET, APP_URL, TENANT_DATA_ENCRYPTION_FALLBACK_KEY,
# OM_INIT_ADMIN_PASSWORD, OM_DISABLE_EMAIL_DELIVERY=1, CACHE_STRATEGY=sqlite, CACHE_SQLITE_PATH=/cache/cache.db,
# RATE_LIMIT_STRATEGY=redis, RATE_LIMIT_ENABLED=false while seeding (true for the load)
#   then: predeploy and `yarn initialize --no-examples` once; app (`sh ./scripts/railway-start.sh`, --cpus 2),
#   worker (`sh ./scripts/railway-worker.sh`, --cpus 1) and a CLI container (`sleep infinity`) on a shared
#   /cache volume; `yarn mercato auth set-password` for the superadmin.
node packages/app/scripts/vereino-capacity-seed.mjs --base-url http://127.0.0.1:5101 --from 101 --clubs 100 \
  --concurrency 6 --super-email <superadmin e-mail> --super-password <set above> \
  --cli 'docker exec vereino-capacity-cli yarn' --state /tmp/vereino-capacity/state.json
node packages/app/scripts/vereino-capacity-load.mjs peak --state /tmp/vereino-capacity/state.json --rps 40 --duration 150
DATABASE_URL=postgres://vereino:<local>@127.0.0.1:5463/vereino \
  node packages/app/scripts/vereino-capacity-load.mjs burst --timeout 1800 --interval 5
```

Warm the app (a minute at 20 req/s) before measuring; the state file holds the synthetic users' tokens (mode 600) —
delete it with the stack: `docker rm -f` the containers, `docker volume rm` the cache volume, `docker network rm`.
