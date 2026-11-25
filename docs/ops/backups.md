# Off-site backups and the restore drill

Engineering standards S15.7 (ADR-012), ENG-10, ENG-TEST-10; issue #464. The Railway project moves to the Pro
plan (D-039, superseding the Hobby plan of ENG-Q-03), where volume backups and point-in-time recovery are turned on if
the plan offers them. Until a PITR restore has been drilled, the nightly off-site dump below stays the documented way
back after data loss, and the RPO and RTO in this file stand.

| | |
|---|---|
| What | `pg_dump --format=custom` of the production database, encrypted with [age](https://age-encryption.org) |
| Where to | an S3-compatible bucket at a second EU provider (ENG-Q-04) |
| When | every night at 02:30 UTC (`railway.backup.toml`) |
| Kept | 30 daily copies (`daily/vereino-YYYY-MM-DD.dump.age`) and 12 monthly copies (`monthly/vereino-YYYY-MM.dump.age`, the first dump of each month) |
| RPO | ≤ 24 hours (no PITR): everything written after the last successful dump can be lost |
| RTO target | ≤ 60 minutes from the decision to restore to the app serving again |
| Key | public key in `docker/backup/age-recipients.txt`; private key only in the password managers of the owner and a second person, never in Railway, the bucket or the repository |

## How it works

- **Job image** `docker/backup/Dockerfile`: Node 24 Alpine with the PostgreSQL 17 client, `age` and `rclone`, plus
  `scripts/backup-dump.mjs`, `scripts/backup-restore.mjs`, `scripts/backup-common.mjs` and the dependency-free
  operations-signal helper `packages/app/scripts/vereino-ops-signal.mjs` of the E18-S04 alerts. No application code,
  no npm dependency.
- **Dump** (`scripts/backup-dump.mjs`): `pg_dump` streams straight into `age`, so the unencrypted dump never touches a
  disk; the ciphertext is uploaded with `rclone`, the first copy of a month is uploaded a second time as the monthly
  copy, and copies beyond 30 daily and 12 monthly are deleted. Only files named `vereino-…dump.age` in `daily/` and
  `monthly/` are ever deleted. A second run on the same day replaces that day's copy.
- **Where it runs: a Railway cron service** in the same project as the database (chosen over a scheduled GitHub
  workflow): `DATABASE_URL` is a Railway reference variable and never leaves Railway, the dump travels over Railway's
  private network, and GitHub never holds a production credential. Railway starts the service on schedule, it runs
  once and exits; a failed run is not retried (the alert fires, the next night tries again).

### Variables of the backup service

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway reference to the production database) |
| `BACKUP_S3_BUCKET` | bucket name |
| `BACKUP_S3_ENDPOINT` | the provider's S3 endpoint URL, for example `https://s3.<region>.<provider>` |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | an access key limited to this bucket (read, write, list, delete) |
| `BACKUP_S3_REGION` | optional; the provider's region when its endpoint needs one |
| `BACKUP_S3_PREFIX` | optional folder inside the bucket, for example `production` |
| `BACKUP_AGE_RECIPIENTS_FILE` | optional; defaults to `docker/backup/age-recipients.txt` in the image |
| `VEREINO_OPS_BACKUP_HEARTBEAT_URL` | optional; the ping URL of the backup heartbeat check (`docs/ops/monitoring.md` → *Heartbeat checks*). Unset, the job pings nothing |

The job refuses to start when a variable is missing (it logs the variable names, never their values) or when the
recipients file holds no `age1…` key, so it can never upload an unencrypted or unreadable dump.

### Logs and the alert

Every line the job prints is one JSON object. Its own lines carry `"job":"backup:dump"`: a successful run ends with
`"msg":"backup.dump.succeeded"` (object key, size in bytes, copies pruned, duration); any failure prints one line at
level `error` with `"msg":"backup.dump.failed"` and a `reason` (`missing-variable`, `no-recipient`, `dump-failed`,
`upload-failed`, `list-failed`, `prune-failed`, `unexpected`) and exits 1.

Railway Hobby has no log-match alerts (`docs/ops/monitoring.md`), so the alert is the **backup heartbeat check** of
E18-S04 (#465, #519). At the end of every run the job writes one operations line (`"signal":"vereino.ops.backup.succeeded"`
or `"signal":"vereino.ops.backup.failed"` with the failed `step`, the documented log filter) and, when
`VEREINO_OPS_BACKUP_HEARTBEAT_URL` is set, pings `<url>` after a successful dump or `<url>/fail` after a failed one.
The check alerts at once on a `/fail` ping and after 26 hours without a success ping (period 1 day + grace 2 h,
S15.5), which also catches a run that never started. A refused ping is logged as `"msg":"backup.heartbeat.failed"`
and does not change the exit code. Logs never hold a connection string, a credential, the heartbeat URL or row data;
tool messages are cut to their headline with URLs and passwords redacted.

## Owner setup (once)

1. Create the bucket at the second EU provider and an access key limited to it. Optionally add a lifecycle rule that
   deletes objects older than 400 days as a safety net; the job keeps the 30 + 12 copies itself.
2. Create the key pair on a trusted machine: `age-keygen -o vereino-backup.key`. Store the whole file (it starts
   with `AGE-SECRET-KEY-1`) in the password managers of the owner and the second person, then delete the file.
3. Put the printed public key (`age1…`) on its own line in `docker/backup/age-recipients.txt` through a pull request.
   To rotate the key, add the new public key, keep the old private key until the last copy encrypted to it has
   expired (12 months), then remove the old public key.
4. In the Railway project add a service from this repository with the config file `railway.backup.toml` and the
   variables above, including `VEREINO_OPS_BACKUP_HEARTBEAT_URL` once the heartbeat check exists
   (`docs/ops/monitoring.md` → *Owner setup*). Run it once by hand ("Run now") and check the log for
   `backup.dump.succeeded` and the check for its first success ping.

## Restore drill (ENG-TEST-10)

Run it after the first deploy (E4 exit gate) and then every quarter, with an agent if useful. The restore never
contacts a database before the dump has been decrypted, so a wrong key changes nothing.

1. Note the start time (UTC).
2. Build the job image and start an empty PostgreSQL 17 on a private Docker network:

   ```bash
   docker build -t vereino-backup -f docker/backup/Dockerfile .
   docker network create backup-drill
   docker run -d --name drill-db --network backup-drill -e POSTGRES_PASSWORD=drill pgvector/pgvector:pg17-trixie
   ```

3. Put the private key from the password manager into a file readable only by you, for example
   `~/drill/identity.txt` (`chmod 600`), and the bucket variables into `~/drill/bucket.env`
   (`BACKUP_S3_BUCKET=…` one per line, the same values as the Railway service).
4. Restore the newest daily copy (or a named one with `--object monthly/vereino-YYYY-MM.dump.age`):

   ```bash
   docker run --rm --network backup-drill --env-file ~/drill/bucket.env -v ~/drill:/keys:ro vereino-backup \
     node scripts/backup-restore.mjs --identity /keys/identity.txt --target postgres://postgres:drill@drill-db:5432/postgres
   ```

   It prints the object it restored and the row count of every table.
5. Compare with production without taking its URL out of Railway: in a shell of the backup service
   (`railway ssh`, or a one-off run with this start command) run
   `node scripts/backup-restore.mjs --counts-only --target "$DATABASE_URL"`. Counts may only differ by what was
   written since the dump (its date is in the object name); a table missing or far off is a failed drill.
6. Note the end time, then remove the drill: `docker rm -f drill-db && docker network rm backup-drill`, and delete
   `~/drill`.
7. Append a record to `docs/ops/restore-drills.md` (create it with the template below on the first drill). A drill
   over the RTO target, or a failed one, also opens an action item with an owner and a date.

For a real restore after data loss follow the production restore of S15.7 (maintenance on, restore into a sibling
Railway service with the same command, switch the production database variable, reconcile Stripe, webhooks and
e-mails from the restore point); `docs/ops/restore.md` is written with the runbooks of E18-S04.

### Drill record template

```markdown
## Drill YYYY-MM-DD

| | |
|---|---|
| Run by | <name> (with <agent>, if any) |
| Backup restored | <object key> (dump time <YYYY-MM-DD HH:MM> UTC) |
| Started / restored / verified (UTC) | <HH:MM> / <HH:MM> / <HH:MM> |
| RTO measured | <minutes> (target ≤ 60) |
| RPO at restore time | <hours since the dump> (target ≤ 24) |
| Tables / rows compared | <n tables>, differences: <none / list with reason> |
| Result | passed / failed |
| Action items | <none / item, owner, due date> |
```

The automated version of this drill, against a Testcontainers database and an S3-compatible server instead of
production, runs with `yarn test:backup` and in the `Backup drill` workflow whenever the job changes and weekly.

## Restoring one club

All clubs share one database (many clubs spec DD-M01), so the nightly dump can only bring back **all** of them at
once. One club is restored from its own archive instead (`club_core export-club`, `docs/ops/clubs.md`) — taken when it
leaves, or from a staging copy restored from the nightly dump when one club lost data (#632):

```bash
yarn mercato club_core restore-club --in /path/orlik-zielonka.zip --dry-run
yarn mercato club_core restore-club --in /path/orlik-zielonka.zip
```

It checks the manifest and the checksum of every module file and attachment. The checksums sit inside the archive and
only catch corruption, so it then refuses an archive that reaches beyond its club (`archive_out_of_scope`, with the
reasons): a table that is not part of a club export, a row of another tenant or of a user outside the archive, or an
attachment whose partition code or path would leave its partition. It refuses — before writing — a database that
holds the club's tenant (`tenant_exists`), a slug another club holds (`slug_taken`), any row of the club
(`club_rows_exist`, with the tables) or a schema without a column of the archive (`schema_mismatch`; migrate the
target first). A deleted club's tombstone is replaced. In one transaction it inserts every table in foreign-key order,
encrypts the decrypted columns again with the target's key for the club's tenant, and writes the attachment files back
through the storage driver; `status: "restored"` prints the rows per module. Then rebuild the indexes, which are not exported
(`yarn mercato query_index rebuild-all --tenant <tenantId>`, `yarn mercato search reindex --tenant <tenantId>`); sign-in tokens, API keys and provider credentials (Stripe) were not exported
and are set up again by the club. The archive carries no password hashes: every user sets a password again (send the
administrator a reset link; the members reset theirs from the sign-in page). The audit log records the restore.

### Single-club restore drill

Run it once before the second real club is onboarded, then with the quarterly drill above. The integration test
TEST-M07 runs the same steps on every pull request that touches it.

1. Note the start time (UTC). Start an empty PostgreSQL 17 as in step 2 of the drill above, with a database
   `staging`, and migrate it from the release you run: `DATABASE_URL=<staging url> yarn db:migrate` (a scratch
   database only — never a dev or production one).
2. Export a synthetic club from staging, or a real club with its administrator's consent:
   `yarn mercato club_core export-club --slug <slug> --out ~/drill/<slug>.zip`.
3. Restore it into the scratch database: `DATABASE_URL=<scratch url> yarn mercato club_core restore-club --in
   ~/drill/<slug>.zip`. The scratch database needs the same `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (or key store) as
   the source only to read old backups; the archive itself is decrypted.
4. Export it again from the scratch database (`DATABASE_URL=<scratch url> … export-club --out ~/drill/check.zip`)
   and compare the two archives: every `data/<module>.json` must be equal except `data/audit_logs.json` (the restore
   adds its entry).
5. Remove the scratch database and `~/drill`, and append a record to `docs/ops/restore-drills.md` with the template
   above (backup restored = the archive's file name, RTO = time to step 4).
