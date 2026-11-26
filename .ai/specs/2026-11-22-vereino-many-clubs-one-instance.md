# Many clubs on one instance

**Date**: 2026-11-22
**Status**: In progress (design approved by the owner on 2026-11-23, PR #644: answers to Q-M01…Q-M08; issue #627, epic E22 #626, decision D-034. Every phase stays Ask First for its migrations and destructive steps unless an approval is recorded on its story, listed in *Ask First items*.)

## TLDR

D-034 (2026-11-22) puts many clubs on one production instance, updated with one deploy: about 1,000 clubs, 150,000
participants and 300,000 accounts per instance, then identical cells. This spec says how. **One club = one tenant with
one organization** (owner's decision Q-M01, 2026-11-23; DD-02 said "1 tenant + 1 organization per instance"). A club is reached by its
**own address**, `<public_slug>.<club domain>`, which replaces `VEREINO_HOME_CLUB_SLUG` and the single `APP_URL` in
e-mails. The 19 schedules each club registers today become **one sweep job per job type**, which visits only the clubs
with due work, in each club's time zone. One command creates a club; another exports it and deletes it after notice.
Per-club limits keep one club from slowing the others. The phases feed stories E22-S03…S07 (#629–#633).

## Problem Statement

The code already scopes every record by `tenant_id` and `organization_id`, but the instance still assumes one club:

- **The address.** `/` leads a guest to the one club named by `VEREINO_HOME_CLUB_SLUG`
  (`club_core/lib/home-route.ts:1-24`, "One club runs per instance (product brief D14)"). E-mail links are built from one
  `APP_URL` (`foundation/services/email-render.ts:15-19`; `communication/services/composer.ts:68-70`;
  `activities/services/share-text.ts:26-28`). The sender is one platform-wide `NOTIFICATIONS_EMAIL_FROM` / `EMAIL_FROM`
  with no club name.
- **The scheduler.** Each club registers **19 schedules** through `registerModuleSchedule`
  (`foundation/services/register-module-schedule.ts:61`): foundation 1, people 3, activities 5, facilities 4,
  payments 6. That is about 1,300 runs per club per day (720 from the 2-minute dispatch sweep, 576 from six 15-minute
  jobs, 12 daily). At 1,000 clubs: 19,000 rows and 1.3 million runs a day, all 15-minute jobs due at the same second,
  and daily jobs bunched at 02:00, 03:00, 06:00 and 09:00. Production runs `QUEUE_STRATEGY=async` (BullMQ scheduler,
  `docs/ops/deploy.md`); the local poller (at most 100 due rows per 30 s, `localSchedulerService.ts:126-132`) would not
  keep up and must stay out of production. The per-tenant cap of 100 active schedules
  (`OM_SCHEDULER_MAX_ACTIVE_SCHEDULES_PER_TENANT`) fails silently with a warning when exceeded. Nothing unregisters a club's schedules when the club goes away.
  `facilities:maintenance-reminders` and the three `people` crons are not re-registered when a club changes its time
  zone, so they drift (only `activities` and `payments` have re-register subscribers).
- **Onboarding.** A club is created by `yarn initialize` on an empty database, then by hand, then by three per-club
  `set-up-club` commands and `people bootstrap-admin` (`docs/ops/deploy.md`). There is no single command.
- **Offboarding.** There is no per-club export and no per-club deletion. `directory.tenants.delete` is a soft delete.
- **Limits.** Rate limits are keyed by client IP (`metadata.rateLimit`); e-mail goes out at 8 per second per worker in
  one bucket shared by every club (`foundation/lib/dispatch-rules.ts:25`). One club's import or announcement to 2,000
  guardians delays every other club's e-mail.
- **Deploy.** The pre-deploy step runs `yarn mercato auth sync-role-acls` (`scripts/railway-predeploy.sh:10`), which
  loops over every tenant (`auth/cli.js:736-756`).

Affected: the maintainers who host clubs (D-034 answers Q06: the maintainers host), every club administrator who
joins, and every guardian who opens a link from an e-mail.

## Overview and Success Measures

- **Primary outcome:** a new club starts on the shared production instance with one command, at its own address, in
  under 15 minutes of operator time, and no existing club notices it (AC-M04, AC-M07).
- **Leading indicators:** the capacity test (TEST-M09) holds the targets below on seeded data; the scheduler table
  holds a constant number of rows whatever the number of clubs; the isolation guard of E22-S02 (#628) stays green.
- **Targets on one instance (capacity test, phase 5):** 1,000 clubs, 150,000 participants, 300,000 accounts; p95 of
  member pages under 800 ms at 50 requests per second; a sweep pass over 1,000 clubs with no due work under 5 s; a deploy
  (migrations + ACL sync) under 10 minutes; a club's daily e-mail reaches its first recipient within 10 minutes of its
  due time while another club sends 5,000 messages.
- **Baseline:** one club per instance; 19 schedule rows per club; no onboarding or offboarding command. Deploy time
  with 1,000 tenants: unknown — measured in phase 5.
- **Market / product reference:** hosted club software (for example Spond, SportEasy, Clubee) puts each club at its own
  subdomain or path on one shared service, and onboarding is self-service. Adopted: a subdomain per club and one shared
  service. Rejected for now: self-service sign-up (the maintainers create clubs, D-034) and custom domains on day one
  (Q-M02 keeps them later). Multi-tenant SaaS practice (pooled database, tenant id on every row, per-tenant keys) is the
  model Open Mercato already implements.

## Goals

- **REQ-M01** — Each club is isolated as its own tenant with one organization (Q-M01), with its own data-encryption key,
  its own roles and its own users.
- **REQ-M02** — A request's hostname selects the club: `<public_slug>.<club domain>` opens that club's public page,
  sign-in and member pages; the bare domain opens a neutral landing page. `VEREINO_HOME_CLUB_SLUG` is retired with a
  deprecation release.
- **REQ-M03** — Every e-mailed link points at the club's own address; the sender's display name is the club's name.
- **REQ-M04** — One sweep schedule per job type replaces the per-club schedules; it visits only clubs with due work,
  spreads start times, and runs time-of-day jobs in each club's time zone. Existing per-club schedules are removed.
- **REQ-M05** — One command creates a club (tenant, organization, settings, roles, first administrator, job state)
  and is safe to re-run.
- **REQ-M06** — A club can be exported (one archive) and, after a notice period, deleted completely, including its
  files and its encryption key.
- **REQ-M07** — Per-club limits on requests, imports and e-mail send rate keep one club from slowing the others.
- **REQ-M08** — The instance meets the capacity targets above, measured by a repeatable capacity test; beyond them a
  new identical cell is opened from the same image and pipeline.
- **REQ-M09** — Deploy time stays bounded with 1,000 tenants: the role-ACL sync runs only when role defaults changed.

## Non-goals

- A guardian's or coach's single view across several clubs (D-014, brief N10). With one tenant per club a person in
  two clubs has two accounts with the same e-mail; linking them is D-014's work.
- Pricing, invoicing clubs, and the entity that signs the processing agreements (D-034 "Not decided here").
- Self-service club sign-up. The maintainers create clubs.
- Custom club domains (`www.klub.pl`) in the first release; the owner decided to add them later (Q-M02, 2026-11-23) through
  `customer_accounts:domain_mapping` or an own table.
- Moving a club between cells, and a cell router. A club is created in one cell and stays there; each cell has its own
  club domain (`<slug>.c1.<domain>` or its own DNS records).
- The cross-club isolation guard itself: E22-S02 (#628) builds it; this spec depends on it as a release condition for
  the second real club.
- The release process for one production: E22-S08 (#634).

## Proposed Solution

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-M01** One club = one `directory:tenant` with one `directory:organization` (amends DD-02 of the club management spec; owner's decision Q-M01, 2026-11-23) | Strongest isolation the platform has: every platform query, cache key, query index row and audit row is tenant-scoped. Each tenant has its own data-encryption key (`kms.createTenantDek`, `auth/lib/setup-app.js:262-267`), so deleting a club can destroy its key. Roles are unique per `(tenantId, name)` (`auth/data/entities.js:93`), so `vereino_payer`, `vereino_treasurer`, `vereino_member` keep their keys in every club (protected contract, `BACKWARD_COMPATIBILITY.md`). The scheduler cap of 100 active schedules per tenant (`OM_SCHEDULER_MAX_ACTIVE_SCHEDULES_PER_TENANT`) is not reached. A club's export and deletion are "everything with this `tenant_id`" | Many clubs as organizations under one tenant | Roles are tenant-wide: one `vereino_member` role would serve every club, and a role ACL with `organizationsJson` null or `__all__` sees **every** organization of the tenant (`rbacService.js:358-361`), so a missing restriction leaks across clubs (fail-open). One encryption key for all clubs; no crypto-shredding. The 100-schedule cap is hit at the 6th club (until phase 1). Gain — one account across clubs (D-014) — is out of scope |
| **DD-M02** The club address is a subdomain of one club domain, `<public_slug>.<VEREINO_CLUB_DOMAIN>`, resolved from the existing `club_core_club_settings.public_slug` (owner's decision Q-M02, 2026-11-23: subdomains now, custom domains later; `/p/<slug>` keeps working) | Reuses the existing globally unique slug and the existing approved system-scope lookup (D-024/D-026, `lookupClubByPublicSlug`, `club_core/data/queries.ts:77-89`): no new table, no new lookup key, one wildcard DNS record and certificate. The slug is already on notice boards and QR codes (`/p/<slug>`) | Enable `customer_accounts` and use `domain_mappings` for every club | `customer_accounts` brings the customer portal, its entities, migrations and ACL sync for a feature Vereino does not use; its resolver only accepts `active` mappings verified through Traefik (`resolveTenantContext.js:44-100`), and Railway is not Traefik. Worth it only for custom domains (deferred) |
| **DD-M03** Path-based `/p/<slug>` pages stay and redirect to the club's address when `VEREINO_CLUB_DOMAIN` is set | Printed links and QR codes keep working | Remove `/p/<slug>` | Breaks printed material; protected route |
| **DD-M04** One sweep schedule per job type, registered once per instance (system scope, `tenantId` null), reading a new job-state table `foundation_club_jobs` (one row per club and job type with `next_due_at`); the sweep enqueues one per-club job with the club's `tenantId`/`organizationId` on the existing `<module>-<name>` queue, with BullMQ `jobId` = `<job_key>:<organization_id>:<next_due_at>` so a re-enqueue of the same due run is a no-op | Schedule rows become constant (19 instead of 19 × N); the sweep reads one index (`job_key, next_due_at`) and visits only due clubs; per-club handlers keep their scope contract (payload `tenantId`/`organizationId`); the only worker change is the optional return value of DD-M06 | A per-club schedule with jitter | Still 19 × N rows and 1.3 million runs a day; does not fix the time-zone drift |
| **DD-M05** Time-of-day jobs keep each club's local time: `next_due_at` is the next local `HH:MM` in the club's `timezone` plus a stable offset of 0–20 minutes from a hash of the organization id; interval jobs get a stable offset within their interval | Spreads 1,000 clubs' 06:00 charge generation over 20 minutes and the 15-minute jobs over 15 minutes; a time-zone change recomputes `next_due_at` in one place for every job (fixes the drift of `facilities` and `people`) | A random delay per run | Not reproducible in tests; a club's jobs would wander |
| **DD-M06** "Has work" is decided by the module, not the sweep: a per-club worker **may** return `{ nextDueAt }` (for example the earliest rental end), stored as `next_due_at` but never later than the job type's maximum interval (safety net: 24 h for interval jobs, the next local run for daily jobs); a worker that returns nothing gets its declared interval. A module may also wake a club early with `foundationClubJobs.wake(scope, jobKey, at)` from a command. `next_due_at` is never null, so a forgotten `wake` delays a club by at most the maximum interval | A club without rentals is not visited every 15 minutes; no cross-module query in the sweep | The sweep queries each module's tables across tenants | Cross-module and cross-tenant reads in one place; violates module boundaries |
| **DD-M07** The sweeps are new system-scope operations (`organizationId: null`), listed exhaustively: **(a)** the job sweep's claim statement on `foundation_club_jobs` — it reads **and writes** (sets `lease_until`) and returns only `(tenant_id, organization_id, job_key, next_due_at)`; **(b)** the e-mail dispatch sweep that replaces the per-club `foundation:dispatch-sweep`, which selects only `(id, tenant_id, organization_id)` of due or stalled rows of the dispatch table, never recipients or content. After either, every further query narrows to that club. Both approved by the owner on 2026-11-23 (Q-M05) as exceptions next to D-024/D-027, returning ids and scope only; phase 1 records them in `AGENTS.md` with the code that runs them | Sweeping without a club in context is the point; the statements return ids and keys only, no personal data | Iterate tenants through `directory` and probe each | 1,000 probes per pass per job type; still system scope |
| **DD-M08** `club_core create-club` creates the tenant and organization through the platform's `setupInitialTenant` path (the same one `mercato auth setup` uses), then runs every module's `seedDefaults`, `people bootstrap-admin` and the job-state rows; idempotent by slug | Reuses the platform path that creates the tenant's encryption key and runs `onTenantCreated`; one command instead of five | A Vereino-only insert of tenant and organization rows | Would skip the encryption key and platform hooks |
| **DD-M09** Offboarding: `club_core export-club` writes one archive (one JSON file per module via optional contributors `club_core.clubExport.<module>`, plus attachment files); `club_core delete-club` after the notice period deletes the explicit target list of *Deletion targets* below. Crypto-shredding (destroying the tenant's key so encrypted columns in old backups become unreadable) is possible **only with a key store such as Vault**: production uses `TENANT_DATA_ENCRYPTION_FALLBACK_KEY`, whose `DerivedKmsService` re-derives every tenant key from the master secret and the tenant id, and the platform KMS has no key deletion (`shared/lib/encryption/kms.js`). Without a key store, backups keep a deleted club until they expire. Owner's decision Q-M07 (2026-11-23): derived per-tenant keys for now; a key store (Vault or a managed KMS) is a **pre-condition before a second club's real data** | The contributor pattern is the one of the person data export spec (`people.dataExport.<module>`); an explicit target list instead of "every row with the tenant id" because sessions, password resets, user roles, the search index, Redis/BullMQ keys and attachment storage are not all keyed by `tenant_id` | Soft delete only | Data stays forever; a processor must delete on termination (GDPR art. 28(3)(g)) |
| **DD-M10** Per-club limits: authenticated rate limits keyed by `tenantId` + route; public routes keyed by IP + club; one running import per club and a row cap per import; e-mail fairness by a per-club token bucket inside the worker's global 8/s (round-robin across clubs with queued mail) | One club's burst cannot fill the shared bucket; uses the platform limiter (`@open-mercato/shared/lib/ratelimit`) with `RATE_LIMIT_STRATEGY=redis` so replicas share counters | A separate queue per club | 1,000 queues; the worker cannot fairly poll them |
| **DD-M11** Deploy: the role-ACL sync runs only when the instance's role-feature defaults changed: a wrapper hashes the merged `defaultRoleFeatures` of every module **plus the installed `@open-mercato/core` version** (a platform upgrade may change `ensureDefaultRoleAcls` itself) and compares it with the hash stored after the last successful sync; `--force` always syncs | Most releases change no ACL; the sync over 1,000 tenants (estimated 30,000–60,000 queries) then costs nothing | Always sync; sync only the tenants touched | Deploy time grows with clubs; per-tenant tracking adds state for no gain |
| **DD-M12** Beyond the targets: identical cells (same image, same pipeline, own database, own club domain); a club lives in one cell | D-034 | Shard one database by tenant | Operationally heavier than another identical cell at this size |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Club | One tenant with exactly one organization and one `club_core_club_settings` row (DD-M01) | `directory`, `club_core` | `create-club` refuses a second organization in a club's tenant |
| Club address | `https://<public_slug>.<VEREINO_CLUB_DOMAIN>`; the slug is lower-case, unique across the instance and not one of the reserved labels (`www`, `app`, `api`, `admin`, `mail`, `status`, `demo`, `blog`, `c1`…`c9`) | `club_core_club_settings.public_slug` | A reserved or taken slug is rejected at create and on edit (400 `club_core.slug_reserved`) |
| Club base URL | The club address when `VEREINO_CLUB_DOMAIN` is set, else `APP_URL` (one-club instances, tests) | `foundation` URL helper | E-mail rendering fails closed in production when neither resolves |
| Job type | `<module>:<name>` of a registered per-club worker, for example `payments:generate-charges` | the module's job declaration | Unknown key → sweep logs and skips |
| Job state | `foundation_club_jobs` row per (club, job type): `next_due_at`, `last_started_at`, `last_finished_at`, `lease_until`, `last_error` | `foundation` | A crashed run leaves `lease_until`; the next sweep after it expires retries |
| Notice period | Days between a club's termination notice and its deletion; the export is offered during it | `club_core_club_settings.offboarding_*` (phase 4) | Deletion before the end of the period is refused |
| Cell | One shared instance with its own database and club domain, released by the same pipeline | ops runbook | — |

Business rules:

- **BR-M1** A club's data never leaves its tenant: every per-club job, export and deletion runs with the club's trusted
  `tenantId` and `organizationId`, taken from `foundation_club_jobs` or the command's arguments, never from a request.
- **BR-M2** A sweep never runs a club's job twice at once. The sweep claims due rows with a short **enqueue lease**
  (`lease_until = now + 5 min`) in one statement:
  `WITH due AS (SELECT id FROM foundation_club_jobs WHERE job_key = $1 AND next_due_at <= now() AND (lease_until IS NULL
  OR lease_until < now()) ORDER BY next_due_at LIMIT 200 FOR UPDATE SKIP LOCKED) UPDATE foundation_club_jobs j SET
  lease_until = … FROM due WHERE j.id = due.id RETURNING …`. When the worker **starts** it extends the lease to
  `now + job timeout`; when it finishes it clears the lease and stores the next due time. The BullMQ `jobId` of DD-M04
  makes a second enqueue of the same due run a no-op even when a queue backlog outlasts the enqueue lease.
- **BR-M3** Time-of-day jobs fire once per local day even across a daylight-saving change: `next_due_at` is computed
  from the local date and time (`HH:MM` + offset), not by adding 24 h. A local time that does not exist (spring gap,
  for example 02:00–02:59 in Europe/Warsaw) moves to the first valid instant after the gap; an ambiguous local time
  (autumn repeat) takes its first occurrence.
- **BR-M4** A deleted club has no job-state rows, no schedules, no attachments and no encryption key; its slug stays
  reserved for 90 days so old links do not reach a new club.

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Maintainer (operator) | Create, export, delete a club; read the sweep status | CLI on the instance (shell access); no HTTP route | none (shell access is the gate) |
| Club administrator | Request the export of their own club; see the notice period | own tenant + organization | `club_core.manage` (existing; the club administrator's grant for the request, #676) |
| Guest | Open a club's public pages at its address | the club resolved from the hostname | none |
| Member, guardian, staff | Sign in at the club's address; links in e-mails lead there | the user's own tenant; a session from another club's host is refused | existing features |

Trusted scope: from the authenticated session as today. The hostname only **selects** which club a guest sees and which
tenant the sign-in form targets; it never widens a signed-in user's scope. A session whose tenant differs from the
host's club is redirected to its own club's address (fail closed).

- **Host, never a client header.** The club of a request is worked out on the server from the `Host` header by one
  helper, `clubFromHost(request)` in `club_core/lib/`, which every page, route and server action calls. No client-sent
  header is trusted: `proxy.ts` does not cover `api/` routes, so a header such as `x-vereino-club-slug` would reach them
  unfiltered. Only hosts under `VEREINO_CLUB_DOMAIN` (and `APP_URL`'s host) are accepted; any other host gets the
  neutral 404 landing page.
- **Same e-mail in two clubs.** With a tenant per club one person may have an account in each club with the same
  e-mail. The platform login without a `tenantId` succeeds only when exactly one user has the e-mail
  (`auth/api/login`), and password reset finds the user by e-mail across all tenants (`findUserByEmail`). So the
  sign-in, reset and invitation forms on a club address always send that club's `tenantId` (the existing `?club=` /
  `vereino_club` mechanism of `sign-in-club.ts`, now from the host), and the reset request is narrowed to that tenant
  through an override of the platform reset route (Ask First; an upstream change is preferred). Without a club host
  (bare domain) the forms are not offered.
- **System scope**, exhaustively: the D-024 slug lookup (now also reached from the host label; same key, same
  query) and the two sweep statements of DD-M07 (Q-M05). Nothing else.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Club boundary | reuse | `directory` tenant + organization | IDs | DD-M01 |
| Tenant creation and encryption key | reuse | `auth` `setupInitialTenant`, `kms` | platform command path | DD-M08 |
| Hostname → club | extend | `club_core` (`lookupClubByPublicSlug`, `home-route.ts`, `sign-in-club.ts`) | Next.js `proxy.ts` sets a trusted `x-vereino-club-slug` header from the host | DD-M02 |
| E-mail base URL and sender name | extend | `foundation` (`email-render.ts`, `dispatch-worker.ts`, `accounts.ts`), `communication` (`composer.ts`), `activities` (`share-text.ts`) | `from` display name passed to the platform mailer | REQ-M03 |
| Platform e-mails and origin check | override (Ask First) | `notifications` (one `appUrl` in `lib/deliveryConfig`), `auth` password reset (origin allow-list of exact origins: `APP_URL`, `NEXT_PUBLIC_APP_URL`, `APP_ALLOWED_ORIGINS`, no wildcard) | upstream change preferred (per-tenant base URL resolver, wildcard origin); else a UMES override of the reset route and a notification delivery override | REQ-M03 cannot be met for platform-sent mail without it |
| Sweep and job state | app-own | `foundation` (new `foundation_club_jobs`, `foundationClubJobs` service, sweep workers) | per-club queue jobs; modules declare jobs | DD-M04 |
| Scheduler | reuse | `scheduler` (`register`/`unregister`) | system-scope schedules | DD-M04 |
| Club export and deletion | app-own | `club_core` commands + per-module optional contributors | DI `club_core.clubExport.<module>` / `club_core.clubDelete.<module>` | DD-M09 |
| Rate limits | reuse | `@open-mercato/shared/lib/ratelimit` | `metadata.rateLimit` key function | DD-M10 |
| Custom domains (later) | reuse | `customer_accounts:domain_mapping` or own table | — | Q-M02 |

No new module: everything lands in `foundation` and `club_core`.

## Architecture and Data Flow

```text
browser ── https://orlik-zielonka.vereino.pl/… ──> page / route / action: clubFromHost(Host) → slug label
          └─> club_core lookupClubByPublicSlug (D-024, one index read) → tenant/org of the club
              ├─ guest: public page / sign-in form for that tenant
              └─ signed-in user of another tenant → redirect to own club's address

scheduler (19 system-scope schedules, one per job type)
   └─> foundation sweep worker <job type>
        └─ claim ≤200 due rows (CTE … FOR UPDATE SKIP LOCKED, enqueue lease; BR-M2)
        └─ enqueue <module>-<name> { tenantId, organizationId }, jobId <job_key>:<org>:<next_due_at>
             └─ worker start: extend lease │ finish: optional nextDueAt → next_due_at (≤ max interval), lease cleared

operator ── yarn mercato club_core create-club --slug --name --admin-email --timezone --locale
          └─ setupInitialTenant (tenant, org, DEK, onTenantCreated) → seedDefaults per module
             → people bootstrap-admin → foundation_club_jobs rows → invitation e-mail at the club's address
```

- **Module boundaries:** `foundation` owns job state and the sweep; each module declares its jobs (key, kind
  `daily-at HH:MM` or `every N min`, timeout) in a typed list exported from its `lib/` and registered through DI, and
  keeps its worker. `club_core` owns club identity, address, onboarding and offboarding.
- **Extension points:** Next.js `proxy.ts` (already present, sets `x-next-url`), platform scheduler, platform rate
  limiter, optional DI contributors for export and deletion.
- **Alternatives considered:** see DD-M01…DD-M12.
- **Compatibility:** `/p/<slug>` routes stay (DD-M03). `VEREINO_HOME_CLUB_SLUG` keeps working on an instance without
  `VEREINO_CLUB_DOMAIN` and is deprecated, not removed, in this epic. Scheduler target IDs (`<module>-<name>` queues and
  `<module>:<name>` workers) stay; only the per-club schedule rows go. One-club instances (tests, a dedicated municipal
  instance) keep working with `APP_URL`.

## User Journeys

### Journey J-M01 — The maintainers start a new club

1. The operator runs `yarn mercato club_core create-club --slug orlik-zielonka --name "UKS Orlik Zielonka"
   --admin-email … --timezone Europe/Warsaw --locale pl` in a shell on the production app service.
2. The command prints the tenant and organization ids, the roles, the job types registered and the club address.
3. The administrator receives an invitation e-mail from "UKS Orlik Zielonka via Vereino" with a link to
   `https://orlik-zielonka.<domain>/…`, sets a password and lands in `/backend`.
4. Re-running the command with the same slug changes nothing and prints `already exists`. A taken or reserved slug
   stops with an error before anything is written.

### Journey J-M02 — A guardian opens a link

1. A reminder e-mail links to `https://orlik-zielonka.<domain>/club/…`; the guardian signs in there.
2. A guardian of club A who opens club B's address while signed in sees B's sign-in page (the session is for A); after
   signing in to A they are sent to A's address.

### Journey J-M03 — A club leaves

1. The club gives notice; the operator runs `club_core offboard-club --slug … --notice-days 30` (Q-M06). The club
   administrator sees a banner with the deletion date and can download the export.
2. `club_core export-club --slug …` writes the archive; its checksum is logged.
3. After the notice, `club_core delete-club --slug … --confirm <slug>` deletes the club and destroys its key; the
   command prints a per-module count of deleted rows. Before the end of the notice it refuses.

## UI and Interaction Contracts

Small UI reach; most of this spec is CLI and jobs.

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/` on the bare club domain | Neutral landing: product name, "Find your club" hint, sign-in for maintainers | static + i18n | current `app/page.tsx` | frontend layout, Tailwind | n/a (static) | REQ-M02 |
| `/` on a club address | Same as today's home route with `VEREINO_HOME_CLUB_SLUG`, for that club | `homeRedirect` | `club_core/lib/home-route.ts` | unchanged | unchanged | REQ-M02 |
| `/backend` banner during the notice period (spot `backend:layout:top`, #676) | Shows the deletion date and an "Export club data" action for the administrator; follows the running export and offers the download of the finished archive | `GET /api/club_core/offboarding`, `POST`/`GET /api/club_core/offboarding/export` | the people first-administrator banner | `Alert` from `@open-mercato/ui` | loading and none render nothing; error shows a retry; export pending/running, ready, failed | REQ-M06 |

Localization: new keys in `club_core/i18n/en.json` and `pl.json`. The landing page is checked at 375 px in both
locales and light and dark mode.

## Data Models

### `foundation_club_jobs` (new, phase 1)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id` | UUID, required | primary key | no | immutable |
| `tenant_id` / `organization_id` | UUID, required | unique `(tenant_id, organization_id, job_key)` | no | from `create-club` or the backfill |
| `job_key` | text, required | index `(job_key, next_due_at)` | no | a declared job type |
| `next_due_at` | timestamptz, nullable | as above | no | null = no work until woken |
| `lease_until` | timestamptz, nullable | — | no | set by the sweep, cleared on finish |
| `last_started_at` / `last_finished_at` | timestamptz, nullable | — | no | observability |
| `last_error` | text, nullable | — | no; error codes only, never personal data | cleared on success |
| `created_at` / `updated_at` | timestamptz | — | no | not user-editable (job row, exempt from optimistic locking) |

### `club_core_club_settings` (changed, phase 4)

Adds `offboarding_notice_at` and `offboarding_delete_after` (timestamptz, nullable). Phase 3 adds the reserved-label
check to the existing `public_slug` validation (no schema change).

All migrations are Ask First.

### Deletion targets (phase 4)

`delete-club` deletes, in this order, and prints a count for each; TEST-M07 asserts each one:

1. Vereino module tables: every row with the club's `tenant_id`, through each module's `club_core.clubDelete.<module>`
   contributor (a module without one fails TEST-M07's catalog check over `information_schema` for `tenant_id` columns).
2. Platform tables keyed by tenant: `directory` (organization, tenant), `auth` (users, roles, role/user ACLs,
   consents), `audit_logs`/`action_logs`, `attachments` metadata, `query_index`/`search` rows, `notifications`,
   `scheduled_jobs` (if any are left), `progress` jobs, `module_configs`, `communication_channels` rows. This needs a
   `BACKWARD_COMPATIBILITY.md` review per platform module (platform-owned tables).
3. Platform rows keyed by user, not tenant: sessions, password-reset and invitation tokens, user-role links,
   sidebar preferences, API keys — selected through the club's user ids before the users are deleted.
4. Non-SQL stores: attachment files in storage, search index documents, the club's cache entries (cleared) and its
   repeatable BullMQ schedules (unregistered); pending one-off BullMQ jobs of the club end on their own (they find no
   rows), so no queued job is deleted on the shared Redis (owner's decision, 2026-11-26, #850); rate-limit counters
   (expire on their own).
5. The tenant's encryption key, only with a key store (Q-M07).

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| CLI | `club_core create-club` | shell | `--slug --name --admin-email --timezone --locale [--dry-run]` | prints ids, roles, job types, address; event `club_core.club.created` | slug taken/reserved → exit 1 before writing; re-run → `already exists`, exit 0 | REQ-M05 |
| CLI | `foundation club-jobs status [--job <key>]` | shell | — | per job type: clubs, due now, leased, last error counts | — | REQ-M04 |
| CLI | `foundation retire-club-schedules [--dry-run]` | shell | — | unregisters the 19 deterministic per-club schedule ids for every club; prints counts | idempotent | REQ-M04 |
| CLI | `club_core offboard-club` / `export-club` / `delete-club` | shell | `--slug`, `--notice-days`, `--out`, `--confirm <slug>` | archive path + checksum; per-module deleted counts; event `club_core.club.deleted` (ids only) | delete before notice end → exit 1; unknown slug → exit 1 | REQ-M06 |
| `GET` | `/api/club_core/offboarding` | auth + `club_core.manage` | — | `{ noticeAt, deleteAfter, exportAvailable, export }` (`export`: the newest export job, `{ jobId, status, requestedAt, finishedAt, bytes }` or null) | 401/403 | REQ-M06 |
| `POST` | `/api/club_core/offboarding/export` | auth + `club_core.manage`, club administrator's grant | `{}` | 202 `{ jobId, status: 'pending' }`: a platform progress job (`club_core.clubs.export`), run by the worker `club_core:club-export` with the same `exportClub` service into the private attachments partition; audited (`club_core.clubs.export_request`) | 409 `export_unavailable` without a notice; 409 `export_running` while one export is pending or running (the settings row is locked for the check) | REQ-M06 |
| `GET` | `/api/club_core/offboarding/export` | auth + `club_core.manage` | — | the newest finished archive of the caller's club, `application/zip`, `Cache-Control: no-store` | 403; 404 `export_not_found`; 409 `export_running` | REQ-M06 |
| DI | `foundationClubJobs` | server | `declare(jobs)`, `wake(scope, jobKey, at)`, `initClub(scope)`, `removeClub(scope)` | — | `wake` never moves `next_due_at` later | REQ-M04 |

Error codes go in `club_core/lib/error-codes.ts` (`club_core.slug_reserved`, `club_core.offboarding_not_due`,
`club_core.export_running`, `club_core.export_unavailable`, `club_core.export_not_found`) and
`foundation/lib/error-codes.ts`.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| scheduler tick per job type | `scheduler` | `foundation` sweep worker | leases due rows, enqueues per-club jobs | lease prevents double runs; a crashed per-club job is retried after its lease expires |
| per-club job finished | module worker | `foundation` | stores `nextDueAt`, clears lease and error | idempotent per run id |
| `club_core.settings.updated` (time zone) | `club_core` | `foundation` subscriber | recomputes `next_due_at` of every time-of-day job of the club | replaces `activities/subscribers/reregister-schedule.ts` and `payments/subscribers/reregister-schedules.ts` |
| `club_core.club.created` | `club_core` | `foundation` | `initClub` rows for every declared job | idempotent upsert |
| `club_core.club.deleted` | `club_core` | `foundation` | `removeClub` | idempotent |
| e-mail dispatch | `foundation` dispatch worker | provider | per-club token bucket, round-robin | as today (leases, sweep retry) |

The `foundation:dispatch-sweep` (every 2 min per club today) becomes one system-scope sweep over the dispatch table's
due or stalled rows, returning ids and scope only (DD-M07 (b)); each found row is then processed in its club's scope.

## Security, Privacy, and Compliance

- **Authorization:** unchanged feature gates; the CLI commands are operator tools without HTTP routes, except the
  administrator's own export.
- **Tenant isolation:** DD-M01 makes the tenant the club boundary. The E22-S02 isolation guard (#628) runs on every PR
  and is the release condition for the second real club. The hostname never widens scope (see *Users*). The sweep's
  system-scope read returns only ids and keys (DD-M07).
- **Sensitive data:** per-tenant encryption keys. With a key store, deletion destroys the key (DD-M09) and encrypted
  columns in backups become unreadable; with today's derived keys it cannot. Q-M07 (2026-11-23) keeps derived keys for now and makes a key store a pre-condition before a second club's real data. Either way plaintext columns in
  backups expire only with backup retention (`docs/ops/backups.md`), which the processing agreement must state. The export archive contains the club's personal data: written to a private path,
  logged in the audit log, never e-mailed as an attachment.
- **Abuse and failure modes:** slug enumeration through subdomains is equal to today's public `/p/<slug>` pages;
  wildcard DNS for unknown labels returns the neutral landing page with 404 status. One club cannot exhaust shared
  limits (DD-M10). A deleted club's slug is reserved for 90 days (BR-M4).
- **Compliance:** the maintainers become processors for many clubs; the DPA signer is open (D-034). Records of
  processing (`docs/compliance/ropa.md`) gain the export and deletion procedures.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-M01 | integration | two clubs (two tenants) created by `create-club` | run each club's setup; sign in to both | separate tenants, roles with the same keys in each, separate encryption keys | REQ-M01, REQ-M05 |
| TEST-M02 | security | two clubs; a user of club A; one e-mail with an account in both clubs | open club B's address, call club B's APIs with A's session and with a forged `x-vereino-club-slug` header; sign in and request a password reset for the shared e-mail on each club's address | redirect to A's address; APIs return A's data or 403, never B's; the header is ignored; each sign-in and reset reaches only that club's account | REQ-M01, REQ-M02 |
| TEST-M03 | integration (browser) | two clubs with published pages; `VEREINO_CLUB_DOMAIN` set to a test domain resolving to the runner | open `a.<domain>/`, `b.<domain>/`, bare domain, unknown label | each club's page; neutral landing; 404 landing | REQ-M02 |
| TEST-M04 | integration | two clubs, e-mail capture | trigger an invitation and a reminder in each | links use each club's address; sender display name is the club's name | REQ-M03 |
| TEST-M05 | integration | three clubs in two time zones; job state at known times | run the sweep with a fixed clock across 06:00 local and both DST changes (02:00/03:00 jobs on the spring and autumn dates); hold a per-club job in the queue longer than the enqueue lease | each club's daily job runs once per local day, offset within 0–20 min, gap times moved after the gap, repeated times run once; a club with no work is not enqueued; a second sweep during a lease or a queue backlog enqueues nothing new | REQ-M04 |
| TEST-M06 | integration | a club with the 19 per-club schedules from the old setup | run `retire-club-schedules`, then the sweeps | no per-club `scheduled_jobs` rows remain; every job type still runs for the club | REQ-M04 |
| TEST-M07 | integration | a club with data in every module and attachments | `export-club`, then `delete-club` after the notice | archive has a file per module; after deletion every target of *Deletion targets* is empty for the club (tables with `tenant_id`, user-keyed rows, attachment files, search documents, the club's cache entries while another club's stay); with a key store the key is gone; a second club is untouched | REQ-M06 |
| TEST-M08 | integration | two clubs; low per-club limits | club A sends 200 e-mails and starts two imports | club B's e-mail goes out within the bucket's round; A's second import gets 409 | REQ-M07 |
| TEST-M09 | capacity (not in `yarn verify`) | seed script: 1,000 clubs, 150k participants, 300k accounts | load script against the production build | the targets of *Overview* hold; the report is attached to the PR | REQ-M08 |
| TEST-M10 | unit + integration | role defaults unchanged / changed | run the pre-deploy wrapper twice | the second run skips the sync; a change runs it | REQ-M09 |
| TEST-M11 | integration (API + browser) | one club with a slug, its administrator and a treasurer | `offboard-club`, then the administrator's export from the API and the `/backend` banner | no notice: nulls, 409 `export_unavailable`; with a notice: one export at a time (409 `export_running`), the downloaded archive is the club's; the treasurer gets 403 on all three calls; the banner shows the date in both locales at 375 px and downloads the archive; withdrawn notice: no banner | REQ-M06 |

## Implementation Phases

Each phase is one story of epic E22, builds on the owner's decisions of 2026-11-23 (Q-M01…Q-M08), and stays Ask First
for its migrations and destructive steps (see the list below). E22-S02 (#628, isolation guard) and E22-S08 (#634, release process) are separate stories outside these
phases.

### Phase 1 — One sweep job per job type (E22-S03, #629)

- **Depends on:** Q-M01 (tenant per club) and Q-M05 (sweep statements approved), both decided 2026-11-23.
- **Outcome:** the scheduler holds 19 rows whatever the number of clubs; every job keeps running per club in its time
  zone.
- **Why this order / value delivered:** removes the largest scaling limit and the time-zone drift before a second club
  is added. It does not need the address scheme (Q-M02), but it does need Q-M01: with an organization per club the
  per-tenant schedule cap is reached at the 6th club, so this phase would become a precondition of the second club.
- **Deliverables:** `foundation_club_jobs` entity + migration; `foundationClubJobs` service; job declarations per
  module (`people`, `activities`, `facilities`, `payments`, `foundation`); sweep worker; time-zone subscriber replacing
  the two re-register subscribers; `setup.ts` stops calling `registerModuleSchedule` per club and calls `initClub`;
  `retire-club-schedules` and `club-jobs status` CLIs; `docs/ops/deploy.md` per-club schedule section rewritten.
- **Independent slices / estimated commits:** service + entity (1), sweep + declarations per module (5), CLIs (1),
  docs (1).
- **Requirements closed:** REQ-M04
- **Tests:** TEST-M05, TEST-M06; unit tests for the due-time calculation (`foundation/lib/club-job-due.ts`, 100 %).
- **Validation:** `yarn generate`, `yarn verify`, `yarn test:integration:vereino --filter TEST-M05` and `TEST-M06`.
- **Exit gate:** on staging, `club-jobs status` shows every job type running for the club with no per-club
  `scheduled_jobs` row left.

### Phase 2 — One command to create a club (E22-S04, #630)

- **Depends on:** Phase 1 (job state), Q-M01.
- **Outcome:** the operator creates a club with one command and a runbook.
- **Deliverables:** `club_core create-club`; reserved slug labels; `docs/ops/clubs.md` runbook (create, verify, hand
  over); the per-deploy ACL-sync wrapper (DD-M11) in `scripts/railway-predeploy.sh`.
- **Requirements closed:** REQ-M05, REQ-M01, REQ-M09
- **Tests:** TEST-M01, TEST-M10
- **Validation:** `yarn verify`; `yarn test:integration:vereino --filter TEST-M01`
- **Exit gate:** a second (synthetic) club created on staging with one command; the isolation guard (#628) green.
- **Pre-condition before a second club's real data (Q-M07, 2026-11-23):** a key store (Vault or a managed KMS) holds
  the tenants' data-encryption keys in production. A synthetic club on staging does not need it; onboarding a second
  real club does, together with the isolation guard (#628).

### Phase 3 — The club from the request hostname (E22-S05, #631)

- **Depends on:** Phase 2; Q-M02 (subdomains, decided 2026-11-23); the domain with a wildcard record (owner action, D12).
- **Outcome:** each club at its own address; e-mails link there and carry the club's name.
- **Deliverables:** `clubFromHost` helper used by `home-route.ts`, `sign-in-club.ts`, public pages and routes; neutral
  landing page; `/p/<slug>` redirect; `foundation` club base URL helper used by `email-render.ts`, `composer.ts`,
  `share-text.ts` and the invitation resend; sender display name; tenant-scoped sign-in and password reset on a club
  address; per-tenant base URL for platform notification e-mails and the reset origin check (upstream change or
  override, Ask First); one central host for social sign-in callbacks (D-027 OAuth redirect URIs cannot be wildcards),
  which returns the user to their club's address; `VEREINO_CLUB_DOMAIN` in `.env.example`, the boot check (optional),
  `BACKWARD_COMPATIBILITY.md`; `VEREINO_HOME_CLUB_SLUG` marked deprecated.
- **Requirements closed:** REQ-M02, REQ-M03
- **Tests:** TEST-M02, TEST-M03, TEST-M04; updated `ISSUE-485-home-route-and-titles.spec.ts`.
- **Validation:** `yarn verify`; the three tests; browser check at 375 px in both locales.
- **Exit gate:** two clubs on staging at two subdomains; links in captured e-mails open the right club.

### Phase 4 — Per-club export, deletion and a restore drill (E22-S06, #632)

- **Depends on:** Phase 2; Q-M06 (30 days' notice, slug reserved 90 days) and Q-M07 (key store before a second club's
  real data), decided 2026-11-23.
- **Outcome:** a club can leave with its data and be deleted completely.
- **Deliverables:** `offboard-club`, `export-club`, `delete-club`; contributors `club_core.clubExport.<module>` and
  `club_core.clubDelete.<module>` in every module; the platform-table and non-SQL deletion steps of *Deletion
  targets*; key destruction through the key store once it exists (Q-M07); offboarding banner and
  export route; a restore drill of one club from a backup into a scratch database, documented in
  `docs/ops/backups.md`.
- **Requirements closed:** REQ-M06
- **Tests:** TEST-M07; TEST-M11 (the administrator's banner and export, #676)
- **Validation:** `yarn verify`; `yarn test:integration:vereino --filter TEST-M07` and `TEST-M11`
- **Exit gate:** a synthetic club exported, deleted and shown absent from every table on staging; the drill recorded.

### Phase 5 — Limits and the capacity test (E22-S07, #633)

- **Depends on:** Phase 1 (the sweep is the main load), Phase 3 (keys per club).
- **Outcome:** proof the instance holds the D-034 target, and per-club fairness.
- **Deliverables:** rate-limit key per tenant on authenticated routes; per-club import cap; per-club e-mail bucket;
  `RATE_LIMIT_STRATEGY=redis` in production; seed and load scripts (`scripts/vereino-capacity-*.mjs`, unit-tested);
  the capacity report; the cell runbook (DD-M12).
- **Requirements closed:** REQ-M07, REQ-M08
- **Tests:** TEST-M08, TEST-M09
- **Validation:** `yarn verify`; TEST-M08; TEST-M09 run by hand, report attached.
- **Exit gate:** the targets in *Overview* met, or the report names the limit and the fix.

### Ask First items (need the owner's approval before the phase starts)

| Item | Phase | Kind |
|---|---|---|
| Q-M01 tenant per club (amends DD-02) — design approved 2026-11-23 | all | architecture |
| `foundation_club_jobs` table | 1 | migration |
| System-scope sweep statements (DD-M07 (a) job claim, (b) dispatch sweep; exceptions like D-024/D-027, recorded in `AGENTS.md`) — approved 2026-11-23 (Q-M05) | 1 | security rule |
| Overrides of platform login/reset and notification base URL (or upstream changes) | 3 | platform contract |
| Hard deletion from platform-owned tables; a key store (Vault or managed KMS), required by Q-M07 before a second club's real data | 4 | platform contract, infrastructure |
| Removal of per-club schedules (`retire-club-schedules`) on staging and production | 1 | data change on a deployed environment |
| Pre-deploy ACL-sync wrapper | 2 | deploy contract |
| `VEREINO_CLUB_DOMAIN`, deprecation of `VEREINO_HOME_CLUB_SLUG`, `/p/<slug>` redirect | 3 | config and route contract |
| Domain with wildcard DNS and certificate | 3 | owner action (D12) |
| `club_core_club_settings` offboarding columns; the export route and feature use | 4 | migration, route |
| Hard deletion of a club and destruction of its key | 4 | destructive operation |
| `RATE_LIMIT_STRATEGY=redis` in production | 5 | infrastructure |
| Enabling `customer_accounts` (not needed: Q-M02 chose subdomains; only for custom domains later) | 3 | new module + migrations |

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-M01 | J-M01 | `create-club`, tenant + org | 2 | TEST-M01, TEST-M02 | AC-M01 |
| REQ-M02 | J-M02, `/` | `proxy.ts`, `lookupClubByPublicSlug` | 3 | TEST-M02, TEST-M03 | AC-M02 |
| REQ-M03 | J-M01, J-M02 | club base URL helper, sender name | 3 | TEST-M04 | AC-M03 |
| REQ-M04 | — | `foundation_club_jobs`, sweep, `retire-club-schedules` | 1 | TEST-M05, TEST-M06 | AC-M04 |
| REQ-M05 | J-M01 | `create-club` | 2 | TEST-M01 | AC-M05 |
| REQ-M06 | J-M03, banner | offboarding CLIs, export route | 4 | TEST-M07 | AC-M06 |
| REQ-M07 | — | rate-limit keys, import cap, e-mail bucket | 5 | TEST-M08 | AC-M07 |
| REQ-M08 | — | capacity scripts | 5 | TEST-M09 | AC-M08 |
| REQ-M09 | deploy | ACL-sync wrapper | 2 | TEST-M10 | AC-M09 |

## Rollout, Migration, and Rollback

- **Phase 1:** expand/contract. Release N adds the table, the sweeps and `initClub` backfill (a `foundation
  set-up-club-jobs --all` CLI run after deploy), with the sweeps **disabled** per job type by a module config flag.
  The operator enables one job type at a time and retires its per-club schedules with `retire-club-schedules
  --job <key>`. Rollback per job type: disable the sweep and run `foundation restore-club-schedules --job <key>`,
  which re-registers that job's per-club schedule for every club in one command (the ids are deterministic). Release
  N+1 removes the per-club registration code, after every job type has run on the sweep for a full release.
- **Phase 2:** additive CLI. Rollback: none needed; the wrapper falls back to always syncing when the stored hash is
  missing.
- **Phase 3:** with `VEREINO_CLUB_DOMAIN` unset everything behaves as today, so the deploy is safe; setting it switches
  addresses. While only one club exists, rollback is unsetting it. Once several clubs exist, unsetting it would strand
  every club but one and break e-mailed links, so rollback instead keeps subdomains resolving and switches link
  generation back to `APP_URL/p/<slug>` (a `VEREINO_CLUB_LINKS=path` switch); the subdomains then redirect to the
  path pages.
- **Phase 4:** additive; deletion only by explicit command with `--confirm`.
- **Phase 5:** limits default to generous values, then tightened from the capacity report.
- **Observability:** `club-jobs status`; the existing worker heartbeat; the payments invariants heartbeat becomes per
  run of the sweep (one ping after all clubs, with the count of failing clubs), replacing the "last clean club clears
  the check" behaviour (`docs/ops/monitoring.md:83`).

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| A bug leaks one club's data to another | every club, legal | DD-M01 tenant boundary; isolation guard #628; TEST-M02 | accepted shared blast radius (D-034) |
| One deploy breaks every club at once | all clubs down | staging first, smoke check, rollback (`docs/ops/deploy.md`), E22-S08 release process | accepted (D-034) |
| Sweep falls behind (many due clubs) | late reminders and charges | 200 rows per pass, passes repeat until none due; `club-jobs status` lag metric; TEST-M09 | burst at the top of a local hour |
| Lease expiry while a slow job still runs → double run | duplicate charge or e-mail | per-club workers are already idempotent (charge generation, reminders); timeout per job type above its p99 | low |
| Time-zone and DST errors | job at the wrong hour or twice | due-time function with 100 % unit coverage over DST dates; TEST-M05 | low |
| Deleting a club misses a table or store | data kept after termination | explicit *Deletion targets*; contributors per module; TEST-M07 catalog check for `tenant_id` tables plus each user-keyed and non-SQL target | a new platform store not on the list |
| Backups keep a deleted club's data | retention beyond termination | key destruction only with a key store (Q-M07); backup retention stated in the DPA | until backups expire |
| No key store in production (derived keys) | no crypto-shredding; one master secret protects every club | Q-M07 (2026-11-23): derived keys accepted until a second club's real data; a key store is a pre-condition for it | until the key store lands |
| Wildcard domain setup on Railway | phase 3 blocked until DNS is ready | Railway supports wildcard custom domains (wildcard CNAME plus a delegated `_acme-challenge` record); owner action D12 | phase 3 delay |
| Platform e-mails and reset origin check use one base URL | links in platform-sent mail point at the wrong host; reset refused on club hosts | phase 3 takes option (c) (owner, 2026-11-23 on #631): the platform's reset page, its notification e-mails and the account invitations (reset links) stay on `APP_URL`, and `/reset` opened on a club's address moves to `APP_URL`; Vereino-sent mail links to the club's address (TEST-M04). An upstream change or an override (options (a)/(b)) is a later, separate decision | platform-sent mail and the reset keep `APP_URL` until that decision |
| Two accounts for a person in two clubs | inconvenience for that person | D-014 later | accepted |
| ACL sync skipped when it should have run | missing features after deploy | hash covers every module's defaults; `--force` flag; TEST-M10 | low |

## Acceptance Criteria

- [ ] **AC-M01** — Two clubs created on one instance are two tenants with their own roles (same keys) and keys; a user of
  one cannot read the other through any route (TEST-M01, TEST-M02).
- [ ] **AC-M02** — `a.<domain>` and `b.<domain>` open each club's public page and sign-in; the bare domain opens the
  neutral landing page; `VEREINO_HOME_CLUB_SLUG` still works when `VEREINO_CLUB_DOMAIN` is unset.
- [ ] **AC-M03** — Every e-mailed link of a club uses its address; the sender display name is the club's name.
- [ ] **AC-M04** — `scheduled_jobs` holds one row per job type, none per club; every job type runs for every club at
  its local time with a stable offset, once per local day across DST.
- [ ] **AC-M05** — `create-club` creates a working club in one run and is a no-op on re-run.
- [x] **AC-M06** — A club is exported and, after the notice period, deleted from every target of *Deletion targets*
  (and its key destroyed when a key store exists, Q-M07, which stays with #740); another club is untouched.
- [ ] **AC-M07** — A club sending 5,000 e-mails or running an import does not delay another club's e-mail beyond one
  bucket round.
- [ ] **AC-M08** — The capacity report shows the *Overview* targets met at 1,000 clubs.
- [ ] **AC-M09** — A deploy with unchanged role defaults skips the ACL sync; deploy time with 1,000 clubs is under
  10 minutes.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | root `AGENTS.md`, `.ai/guides/spec-delivery.md`, `BACKWARD_COMPATIBILITY.md`, `docs/ops/deploy.md` |
| Data models, APIs, events, UI, and tests are internally consistent | pass | traceability table |
| Every workflow completes end to end without a catch-all integration phase | pass | phases 1–5, one story each |
| Platform-native reuse and extension points were chosen before custom code | pass | DD-M01, DD-M02, DD-M08, DD-M10 reuse platform paths |
| UI contracts identify references, canonical components, and theme/state coverage | pass | three small surfaces |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | *Implementation Phases* |

Verdict: `Ready for implementation — the owner answered Q-M01…Q-M08 on 2026-11-23; each phase stays Ask First for its migrations and destructive steps.`

## Open Questions

All answered by the owner on 2026-11-23 (PR #644). Q-M03, Q-M04 and Q-M08 take the recommendation; the owner may change them later.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-M01 | Is a club **one tenant with one organization** (recommended, DD-M01) or **one organization inside one shared tenant**? | Władek Kuć | yes — all phases | decided 2026-11-23: **one tenant per club** (DD-M01; DD-02 of the club management spec amended accordingly) |
| Q-M02 | Which address scheme: **subdomain** `<slug>.<club domain>` (recommended), **path** `<domain>/<slug>` only (today's `/p/<slug>`), or **custom domains** now (`customer_accounts:domain_mapping`)? | Władek Kuć | yes — phase 3 | decided 2026-11-23: **subdomains now** (`<public_slug>.<club domain>`), custom domains later; `/p/<slug>` keeps working (DD-M02) |
| Q-M03 | Sender: the club's name as display name on one verified Vereino address ("UKS Orlik via Vereino" `<no-reply@…>`, recommended), or each club's own sending domain? | Władek Kuć | no — phase 3 default applies | decided 2026-11-23: recommendation applies — the club's display name on one Vereino sender; the owner may change it later |
| Q-M04 | Per-club limit defaults: 600 authenticated requests per minute per club, 1 running import of at most 5,000 rows, 2 e-mails per second per club inside the shared 8/s? | Władek Kuć | no — phase 5 tunes them | decided 2026-11-23: recommendation applies — 600 req/min, 1 import ≤ 5,000 rows, 2 e-mails/s; phase 5 tunes them |
| Q-M05 | Approve the two system-scope sweep statements of DD-M07 — (a) the job claim on `foundation_club_jobs`, which reads and sets a lease, and (b) the dispatch sweep over due e-mail rows, both returning ids and scope only — as recorded exceptions next to D-024/D-027? | Władek Kuć | yes — phase 1 | decided 2026-11-23: **approved** — both statements of DD-M07 as exceptions next to D-024/D-027, returning ids and scope only; recorded in `AGENTS.md` by phase 1 |
| Q-M06 | Notice period before deletion: 30 days (recommended), and slug reserved 90 days after deletion? | Władek Kuć | yes — phase 4 | decided 2026-11-23: **30 days** notice before deletion; a deleted club's slug stays reserved **90 days** (BR-M4) |
| Q-M07 | Key store: keep derived per-tenant keys from `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (no crypto-shredding; deleted clubs stay in backups until they expire), or add Vault or a managed KMS before phase 4 (recommended before real data of a second club)? | Władek Kuć | yes — phase 4 | decided 2026-11-23: **derived per-tenant keys for now**; a key store (Vault or managed KMS) is a **pre-condition before a second club's real data** (phase 2 pre-condition, DD-M09) |
| Q-M08 | Keep this one umbrella spec, or split phase 1 (sweep) and phase 4 (offboarding) into their own specs? | Władek Kuć | no | decided 2026-11-23: recommendation applies — one umbrella spec; a phase may be split out when it is picked up |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/`.
