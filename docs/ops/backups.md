# Off-site backups and the restore drill

Engineering standards S15.7 (ADR-012), ENG-10, ENG-TEST-10; issue #464. The Railway project runs on the Hobby
plan without point-in-time recovery (owner decision ENG-Q-03), so the nightly off-site dump is the only way back
after data loss.

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
  `scripts/backup-dump.mjs`, `scripts/backup-restore.mjs` and `scripts/backup-common.mjs`. No application code, no npm
  dependency.
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

The job refuses to start when a variable is missing (it logs the variable names, never their values) or when the
recipients file holds no `age1…` key, so it can never upload an unencrypted or unreadable dump.

### Logs and the alert

Every line the job prints is one JSON object with `"job":"backup:dump"`. A successful run ends with
`"msg":"backup.dump.succeeded"` (object key, size in bytes, copies pruned, duration). Any failure prints one line at
level `error` with `"msg":"backup.dump.failed"` and a `reason` (`missing-variable`, `no-recipient`, `dump-failed`,
`upload-failed`, `list-failed`, `prune-failed`, `unexpected`) and exits 1. The Railway log alert of E18-S04 (#465)
watches `backup.dump.failed`, and a missing `backup.dump.succeeded` for 26 hours (S15.5). Logs never hold a
connection string, a credential or row data; tool messages are cut to their headline with URLs and passwords redacted.

## Owner setup (once)

1. Create the bucket at the second EU provider and an access key limited to it. Optionally add a lifecycle rule that
   deletes objects older than 400 days as a safety net; the job keeps the 30 + 12 copies itself.
2. Create the key pair on a trusted machine: `age-keygen -o vereino-backup.key`. Store the whole file (it starts
   with `AGE-SECRET-KEY-1`) in the password managers of the owner and the second person, then delete the file.
3. Put the printed public key (`age1…`) on its own line in `docker/backup/age-recipients.txt` through a pull request.
   To rotate the key, add the new public key, keep the old private key until the last copy encrypted to it has
   expired (12 months), then remove the old public key.
4. In the Railway project add a service from this repository with the config file `railway.backup.toml` and the
   variables above. Run it once by hand ("Run now") and check the log for `backup.dump.succeeded`.

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
