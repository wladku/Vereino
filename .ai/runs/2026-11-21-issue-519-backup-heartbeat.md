# Run: issue #519 — wire the nightly backup job to the E18-S04 heartbeat alert

- **Goal / trigger:** Cezar task c131c19f (`om-auto-fix-issue 519`, step 1 of 3: build and open a draft PR; an
  independent reviewer marks it ready).
- **Issue / branch:** #519 / `feat/issue-519-wire-nightly-backup-heartbeat`. Prerequisites #474 (E18-S03) and #476
  (E18-S04) are both merged on `main`.

## Steps

1. Claimed #519 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Chose to call the existing helper in-process instead of a second implementation: `scripts/backup-dump.mjs` imports
   `formatOpsLine`, `pingHeartbeat`, `OPS_EVENTS` and `HEARTBEAT_URL_VARIABLES` from
   `packages/app/scripts/vereino-ops-signal.mjs`, and `docker/backup/Dockerfile` copies that file at its repository
   path. Reasons: one source for the alert token, the `/fail` convention and the URL redaction; the helper is
   dependency-free (Node built-ins and global `fetch`); and the manual test of `docs/ops/monitoring.md` (Owner setup
   step 7, `node packages/app/scripts/vereino-ops-signal.mjs backup.failed …` in the backup job's shell) now works,
   which it could not before because the image lacked the file.
3. `backup-dump.mjs` writes `vereino.ops.backup.started` after its start line and, at the end of every run,
   `vereino.ops.backup.succeeded` (`bytes`, `durationMs`) or `vereino.ops.backup.failed` (`step` = the existing
   `reason`, including `missing-variable` and `no-recipient`), then pings `<url>` / `<url>/fail` when
   `VEREINO_OPS_BACKUP_HEARTBEAT_URL` is set. Unset: no ping, behaviour as before (exit codes, existing
   `backup.dump.*` lines unchanged). A refused or failing ping logs `backup.heartbeat.failed` with the variable name
   only and never changes the exit code.
4. Unit tests (`backup.test.mjs`): updated the line expectations for the added ops lines; new tests for the success
   ping, the `/fail` ping on three failure kinds (with the documented alert filter matching exactly one line), no URL
   → no ping, and a refused/throwing ping. No URL or check id appears in any line.
5. Drill (`backup-drill.e2e.mjs`, `yarn test:backup`): a recording HTTP server (the job image running `node -e`) on the
   drill network; the successful dump pings `/ping/drill-check`, the run without bucket credentials pings
   `/ping/drill-check/fail`. `backup-drill.yml` paths now include the helper.
6. Docs: `docs/ops/backups.md` lists `VEREINO_OPS_BACKUP_HEARTBEAT_URL` among the service variables and its "Logs and
   the alert" section describes the heartbeat instead of a Railway log alert; `docs/ops/monitoring.md` names
   `backup-dump.mjs` as the pinger, the job's refused-ping line, and drops "once E18-S03 lands".
7. Lesson `railway-hobby-has-no-log-alerts` extended: a job image that copies only its own scripts cannot send the
   signal a runbook promises.

## Decisions

- No contract change: the token `vereino.ops.backup.failed`, the variable name and the helper's path stay as
  `BACKWARD_COMPATIBILITY.md` lists them; the job only adds log lines and an optional outbound GET.
- No spec change: S15.5 already requires the 26-hour missed-backup alert; this wires the job to it.

## Commands and results

- `node --test scripts/__tests__/backup.test.mjs` (packages/app) — `tests 40`, `pass 40`.
- `yarn test:backup` — `tests 3`, `pass 3`, exit 0 (real image, pg_dump, age, rclone, S3 gateway, heartbeat server).
- `yarn verify` — `all 18 step(s) passed`, exit 0 (`test:scripts` holds 100 % line/branch/function coverage).
- No integration test under `packages/app/.ai/qa/tests` is added or touched; no UI change, so no browser evidence.

## Open problems / next steps

- Owner: create the backup heartbeat check and set `VEREINO_OPS_BACKUP_HEARTBEAT_URL` on the Railway backup service
  (`docs/ops/monitoring.md` → Owner setup).
- Reviewer session marks the draft PR ready; this run does not merge.
