---
title: "Railway cannot alert on a log line, and Monitors need the Pro plan: route urgent alerts through the uptime monitor"
modules: ["platform", "foundation"]
areas: ["integration", "debugging"]
topics: ["railway", "alerts", "heartbeat", "monitoring"]
---

# Railway cannot alert on a log line, and Monitors need the Pro plan: route urgent alerts through the uptime monitor

**Context**: E18-S04 (#465) was to wire "Railway log-based alerts" (owner decision ENG-Q-05) for a failed backup, worker
errors and 5xx. Railway's docs (`docs.railway.com/guides/logs`, `/guides/monitoring`, `/observability/webhooks`, read
2026-11-20) offer log search with filters but no alert on a match; Monitors (CPU, RAM, disk thresholds) are Pro-only;
project webhooks cover deployment status and volume usage; there is no log drain setting and Hobby keeps logs 7 days.
Railway documents only string `level` values, while the platform logger writes pino's numeric levels.

**Problem**: A runbook that promises "Railway alerts on `vereino.ops.backup.failed`" looks complete and silently never
pages anyone on the Hobby plan.

**Rule**: Every alert that must arrive within minutes uses a signal the uptime monitor sees: an HTTP check
(`/api/healthz`, which answers 503 within 1.5 s when PostgreSQL or Redis fails) or a heartbeat (push) check —
`VEREINO_OPS_WORKER_HEARTBEAT_URL` pinged after `foundation:dispatch-sweep`, `VEREINO_OPS_BACKUP_HEARTBEAT_URL`
(`<url>/fail` on failure) through `packages/app/scripts/vereino-ops-signal.mjs`. Log lines still carry stable text
tokens (match text, not `@level:error`) for triage and the weekly digest. Re-check the Railway docs before relying on a
plan feature, and record the date checked in `docs/ops/monitoring.md`.

A runbook can also promise a signal that the job cannot send: E18-S03 and E18-S04 landed in parallel, and the backup
job image (`docker/backup/Dockerfile`) copied only `scripts/backup-*.mjs`, so `docs/ops/backups.md` still described a
log alert and the job never pinged its heartbeat (#519). A job that must signal calls the helper in-process and its
image copies the helper at its repository path; the image's drill (`yarn test:backup`) runs the heartbeat against a
recording HTTP server, and the drill workflow's `paths` include the helper.

**Applies to**: `docs/ops/monitoring.md`, `docs/ops/incident.md`, `packages/app/scripts/vereino-ops-signal.mjs`,
`packages/app/src/modules/foundation/lib/worker-heartbeat.ts`, the backup job of E18-S03 (#464), any new job that needs
an alert, and the image of any job that copies a helper (`docker/backup/Dockerfile`, `.github/workflows/backup-drill.yml`).
