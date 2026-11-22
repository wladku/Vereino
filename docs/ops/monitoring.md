# Monitoring and alerts

What watches Vereino on `staging` and `production`, which signal raises which alert, and the checklist the owner follows
to set it up. Engineering standards S15.4–S15.6 and S15.9, owner decision ENG-Q-05 (epic #460): an external uptime
monitor plus log-based alerts, no tracing or error-tracking backend in 1.0. What to do once an alert fires is in
[`incident.md`](incident.md).

## What Railway can and cannot alert on (checked 2026-11-20)

ENG-Q-05 assumed Railway alerts on log lines. Railway's documentation (`docs.railway.com/guides/logs`,
`/guides/monitoring`, `/observability/webhooks`, read 2026-11-20) shows:

- **No alert on a log match.** Logs can be searched (plain substrings, `@attribute:value`, `@httpStatus:500..599`,
  `AND` / `OR` / `-`), but no feature turns a search into a notification.
- **Monitors** (CPU, RAM, disk, egress thresholds, e-mail and in-app) **require the Pro plan**; ENG-Q-03 chose Hobby.
- **Project webhooks** send deployment status changes (e.g. `Deployment.failed`) and volume usage alerts; Slack and
  Discord are supported through Railway's webhook muxers. The plan requirement is not stated.
- **No log drain setting.** Logs are kept 7 days on Hobby (30 on Pro).

So on Hobby the alerts that must reach the owner within minutes do not depend on Railway's log search. The uptime
monitor carries them: HTTP checks for the app, and **heartbeat checks** (push checks: the job calls a URL, and a
missing or `/fail` call alerts) for the worker and the backup. The log filters below remain the documented, tested
signatures for triage and for the weekly digest. The jobs also write the log lines, so an alert can be built on them
later (Pro plan, or a log forwarder to a log vendor) without changing code. **Owner decision needed:** accept this
reading of ENG-Q-05, or move to Pro (Monitors for the disk alert) or a log vendor for the alerts marked *digest only*.

## Alerts (S15.5)

Every alert goes to **both maintainers by e-mail and by phone push** (the monitor's mobile app or SMS). Everything
marked *digest* goes into the weekly review instead.

| Symptom (S15.5) | Signal | Alert rule | Worst-case time to alert |
|---|---|---|---|
| App unavailable | uptime HTTP check of `/api/healthz` | 3 consecutive failed checks, 1-minute interval | 3–4 min |
| PostgreSQL or Redis down | the same check: the route answers 503 within 2 s (measured below) | as above | 3–4 min |
| Public pages or sign-in broken | HTTP checks of `/p/<club-slug>` and `/login` | 2 consecutive failures, 5-minute interval | 10 min |
| Worker, scheduler or queue stopped | heartbeat `VEREINO_OPS_WORKER_HEARTBEAT_URL` | no ping for period 3 min + grace 2 min | 5 min after the last ping |
| Backup failed | backup job pings `<VEREINO_OPS_BACKUP_HEARTBEAT_URL>/fail`; log line `vereino.ops.backup.failed` | a `/fail` ping alerts at once | < 1 min |
| Backup missed (job never ran) | heartbeat `VEREINO_OPS_BACKUP_HEARTBEAT_URL` | period 1 day + grace 2 h (S15.5: no successful run in 26 h) | 26 h |
| Payments invariant drift (S10.6, REQ-043) | job `payments:verify-invariants` pings `<VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL>/fail`; log line `vereino.ops.payments.invariants.drift` | a `/fail` ping alerts at once | < 1 min after the nightly run (03:00 club time) |
| Payments invariant check missed | heartbeat `VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL` | period 1 day + grace 2 h | 26 h |
| Deploy failed or crashed | Railway project webhook, deployment status events | every `failed` or `crashed` status | < 1 min |
| PostgreSQL disk above 80 % | Railway project webhook, volume usage alert | threshold 80 % | as Railway sends it |
| HTTP 5xx above 1 % for 5 minutes | log search `@httpStatus:500..599` | *digest only on Hobby* | — |
| Webhook signature or processing failures | log search (see *Log filters*) | *digest only on Hobby* | — |
| Queue backlog older than 15 minutes | none on Hobby; the worker heartbeat catches a stopped worker, not a slow one | *gap* | — |
| Errors with a `reportError` fingerprint | log search `"Application error reported"` | *digest only on Hobby* | — |

A failed scheduled job other than the backup shows up as `"Job failed"` in the worker log (digest); a job that stops
running at all stops the worker heartbeat only when it is `foundation:dispatch-sweep`, so the digest also checks the
`info` lines of the daily jobs.

## Uptime monitor checks

| Check | URL | Interval | Passes when | Notes |
|---|---|---|---|---|
| Health | `https://<host>/api/healthz` | 1 min | HTTP 200, body contains `"status":"ok"` | `railway.toml` uses the same path for deploy health (S15.4) |
| Public club page | `https://<host>/p/<club-slug>` | 5 min | HTTP 200 | staging: the seeded demonstration club; production: the pilot club |
| Sign-in page | `https://<host>/login` | 5 min | HTTP 200 | proves the app renders pages, not only the health route |

Use two or more probe regions in the EU when the vendor offers them, so one network blip does not page anyone. Never
put a credential, token or member's page in a check URL.

### What `/api/healthz` does

The platform route probes PostgreSQL (`SELECT 1`) and, when `CACHE_STRATEGY=redis` (set by
`scripts/railway-start.sh`), Redis, each with a 1 500 ms timeout, and answers `{"status":"degraded"}` with HTTP 503
when one fails, logging `[healthz] Infrastructure probe failed` with the component (`database` or `redis`).
Measured on 2026-11-20 with a production build (`next start`, `NODE_ENV=production`) — the local part of ENG-TEST-08:

| Case | Answer | Time |
|---|---|---|
| Both up | 200 `{"status":"ok"}` | 4 ms |
| PostgreSQL stopped (connection refused) | 503 `{"status":"degraded"}` | 7 ms |
| PostgreSQL hung (`docker pause`) | 503, `database healthcheck timed out` | 1.50 s |
| Redis stopped (`CACHE_STRATEGY=redis`) | 503, `redis healthcheck timed out` | 1.50 s |

## Heartbeat checks

| Check | Variable (service) | Pinged by | Period / grace |
|---|---|---|---|
| Worker | `VEREINO_OPS_WORKER_HEARTBEAT_URL` (worker service) | the `foundation:dispatch-sweep` job after each successful sweep — the scheduler starts it every 2 minutes for every club, through the queue and the worker, and it reads PostgreSQL; at most one ping a minute per process | 3 min / 2 min |
| Payments invariants | `VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL` (worker service) | the nightly `payments:verify-invariants` job of every club (03:00 in the club's time zone, #531): `<url>` after a clean run, `<url>/fail` when a charge does not match its payments or the `KP`/`RG` numbering has a duplicate or a gap; by hand: `yarn mercato payments run-job --job verify-invariants --tenant <id> --org <id>`. With several clubs a later clean club's ping clears the check again, but the `/fail` notification has already gone out; the log line names the club | 1 day / 2 h |
| Backup | `VEREINO_OPS_BACKUP_HEARTBEAT_URL` (backup job, E18-S03 #464) | `scripts/backup-dump.mjs` at the end of every run (#519): `<url>` after a successful dump, `<url>/fail` after a failed one, through the helpers of `packages/app/scripts/vereino-ops-signal.mjs`, which the job image copies in; by hand: `node packages/app/scripts/vereino-ops-signal.mjs backup.succeeded …` or `… backup.failed …` | 1 day / 2 h |

The worker heartbeat needs at least one club with its schedules (`docs/ops/deploy.md` → *Per-club schedules*): with
no club there is no sweep and the check alerts — on staging the demonstration club provides it. A ping carries no
payload. A refused ping is logged by the worker as `Worker heartbeat ping failed`, by the backup job as
`"msg":"backup.heartbeat.failed"` (with the variable name, never the URL) and by the manual helper as
`ops-signal: the heartbeat ping of VEREINO_OPS_BACKUP_HEARTBEAT_URL failed`; a refused ping never changes the job's
exit code. A backup that never runs pings nothing, so the missed-run alert fires after period plus grace.

The `/fail` suffix is the convention of Healthchecks.io and Better Stack heartbeats; with another vendor, check that
it accepts a failure ping at `<url>/fail` before relying on it.

## Log filters

Search in the Railway dashboard (*Observability → Logs*, or the service's *Logs* tab). The platform logger writes pino
JSON with a numeric `level` (50 = error); Railway documents only string levels, so the filters match text, not
`@level:error`.

| What | Filter | Written by |
|---|---|---|
| Backup failed | `vereino.ops.backup.failed` | `scripts/backup-dump.mjs` through `packages/app/scripts/vereino-ops-signal.mjs` (backup job) |
| Backup succeeded / started | `vereino.ops.backup.succeeded`, `vereino.ops.backup.started` | the same |
| Health probe failed | `"[healthz] Infrastructure probe failed"` | `/api/healthz` (web service) |
| Worker alive | `"Dispatch sweep finished"` | `foundation:dispatch-sweep` (worker service), every 2 min per club |
| Worker heartbeat not delivered | `"Worker heartbeat ping failed"` | the same |
| Payments invariant drift | `vereino.ops.payments.invariants.drift` | `payments:verify-invariants` (worker service), `error` line `Payments invariants drift` with `organizationId`, the counts, `chargeDrifts` (`[chargeId, kind, status, expectedStatus]`) and `numberingDrifts` (`[series, kind, month, count, numbers]`); ids and counts only, at most 50 of each |
| Payments invariants clean | `vereino.ops.payments.invariants.verified` | the same, `info` line `Payments invariants verified` |
| Payments invariants heartbeat not delivered | `"Payments invariants heartbeat ping failed"` | the same |
| Scheduled or queued job failed | `"Job failed" OR "Job exhausted all attempts"` | platform queue (worker service) |
| Error with a fingerprint | `"Application error reported"` | platform `reportError`; the line carries `error.code` = `<module>.<reason>` (S15.2) |
| HTTP 5xx | `@httpStatus:500..599` | Railway HTTP logs |
| Stripe webhook failures | `@path:/api/payment_gateways/webhook/stripe AND @httpStatus:>=400` | Railway HTTP logs |

The backup line is one JSON record, for example:

```json
{"level":"error","time":1795000000000,"name":"ops","signal":"vereino.ops.backup.failed","msg":"Backup failed","step":"upload","exitCode":1}
```

Its fields hold step names, exit codes, sizes and durations only; a value that looks like a URL or a connection string
is written as `[redacted-url]` (S15.1). `packages/app/scripts/__tests__/vereino-ops-signal.test.mjs` checks that the
failure line matches `vereino.ops.backup.failed`, that the started and succeeded lines do not, and that this page
names every filter and variable of the script.

### `reportError` fingerprints need `TELEMETRY_BACKEND=console`

`reportError` writes nothing while telemetry is off (`TELEMETRY_BACKEND` unset). With `TELEMETRY_BACKEND=console` the
platform logs every reported error as `Application error reported` with its `error.code` fingerprint and exports
nothing to any vendor (the console provider only writes logs; spans are `debug` and hidden at `OM_LOG_LEVEL=info`).
Set it on both Railway services (web and worker). This is not a tracing backend, so S15.3 and ENG-Q-05 still hold.

## Weekly digest

Every Monday one maintainer runs the *digest only* filters over the last 7 days (Hobby keeps logs 7 days), opens an
issue for every new fingerprint or failing job, and notes "digest done" with the date in the team channel. Spending
the 30-day error budget (S15.6) stops feature deploys; see [`incident.md`](incident.md) → *Service level objectives*.

## Vendor candidates

The owner chooses; no agent creates an account. Prefer a vendor that stores data in the EU and offers HTTP checks,
heartbeat checks with a `/fail` URL, phone push and two notification recipients on the plan you pick. The monitor sees
only the public URLs and the timings, no personal data; still add the chosen vendor to the processor register
(`docs/compliance/processors.md`, E19) with its region and terms.

| Candidate | HTTP checks | Heartbeats | Notes to verify before choosing |
|---|---|---|---|
| Better Stack (Uptime) | yes | yes, with `/fail` | EU data region, phone push in the free tier, number of monitors |
| UptimeRobot | yes | on paid plans | heartbeat plan price, mobile push |
| Healthchecks.io | no | yes, with `/fail` | pair it with an HTTP monitor; self-hostable |
| Uptime Kuma (self-hosted) | yes | yes (push monitors) | needs its own host outside Railway, or it goes down with the app |

## Owner checklist

Do it on `staging` first, run ENG-TEST-08, then repeat for `production`.

1. Choose the vendor; create the account with both maintainers as recipients (e-mail and phone push).
2. Create the three HTTP checks of *Uptime monitor checks* for the environment's public host.
3. Create the two heartbeat checks with the periods and graces of *Heartbeat checks*; copy each ping URL.
4. In Railway set, per environment:
   - worker service: `VEREINO_OPS_WORKER_HEARTBEAT_URL=<worker ping URL>`, `TELEMETRY_BACKEND=console`;
   - web service: `TELEMETRY_BACKEND=console`;
   - backup job: `VEREINO_OPS_BACKUP_HEARTBEAT_URL=<backup ping URL>` (`docs/ops/backups.md` → *Variables of the
     backup service*).
   Redeploy both services.
5. In Railway *Project Settings → Webhooks*, add a webhook for deployment status changes and volume usage alerts to the
   alert channel (a Slack or Discord muxer, or the vendor's incoming webhook); set the volume alert at 80 % if Railway
   offers the threshold.
6. Wait 5 minutes; the worker heartbeat turns *up*. If not, search `"Dispatch sweep finished"` and
   `"Worker heartbeat ping failed"` in the worker logs.
7. Test the backup alert: in the backup job's shell run
   `node packages/app/scripts/vereino-ops-signal.mjs backup.failed step=drill` — an alert must arrive within 1 minute
   and the job log must show `vereino.ops.backup.failed`; then run the same with `backup.succeeded` to close it.
   Then start the backup service once by hand ("Run now"): the check gets a success ping when the dump succeeds.
8. Save the *Log filters* as bookmarks for the weekly digest.
9. Run ENG-TEST-08 below and record the evidence.

### ENG-TEST-08 on staging (owner part)

1. Note the time (UTC). Stop the staging PostgreSQL service in Railway.
2. Within 5 minutes both maintainers receive the alert. Record the minute it arrived and the `/api/healthz` answer
   (`curl -s -w '%{http_code}\n' https://<staging-host>/api/healthz` → `503`).
3. Start PostgreSQL; the check recovers (record the recovery notification).
4. Repeat with the Redis service.
5. Record both runs (stop time, alert time, recovery time, who received it) in the E4 run log and on the epic (#460). An alert later than 5 minutes is an action item: shorten the check interval or the failure count.
