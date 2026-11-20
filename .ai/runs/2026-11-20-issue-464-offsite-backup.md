# Run: issue #464 — nightly encrypted off-site backup and restore drill (E18-S03)

- **Trigger**: Cezar run, `cezar` label on #464 (om-auto-fix-issue), 2026-11-20.
- **Spec**: `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` S15.7, phase E4 slice (b), ENG-10, ENG-TEST-10;
  owner decisions ENG-Q-03/ENG-Q-04 recorded on epic #460.
- **Branch**: `feat/issue-464-nightly-encrypted-db-backup`.

## Goal

A dump job (pg_dump → age → S3-compatible EU bucket, 30 daily + 12 monthly copies), a restore script that decrypts,
restores into PostgreSQL 17 and prints row counts, `docs/ops/backups.md`, an automated end-to-end drill, 100 %
coverage under `test:scripts`.

## Steps and decisions

1. Claimed #464 (assignee, `in-progress`, 🤖 comment naming this worktree and branch).
2. **No npm dependency** (Ask First): the scripts call binaries — PostgreSQL 17 client, `age`, `rclone` — from a
   dedicated job image `docker/backup/Dockerfile` (`node:24-alpine` pinned by digest + `apk add postgresql17-client
   age rclone`). rclone over the aws CLI: one static binary, an on-the-fly `:s3:` remote from environment variables, so
   no config file holds credentials.
3. **Where it runs: Railway cron service** (`railway.backup.toml`, 02:30 UTC, restart policy NEVER) rather than a
   scheduled GitHub workflow: `DATABASE_URL` stays a Railway reference and never leaves Railway; GitHub holds no
   production credential.
4. **No plaintext on disk in the job**: `pg_dump` streams into `age --output`; only the ciphertext is staged and
   uploaded, then the staging directory is removed.
5. **Retention in the job**: dated names (`daily/vereino-YYYY-MM-DD.dump.age`, `monthly/vereino-YYYY-MM.dump.age`, the
   first copy of a month) sort chronologically; only files matching these names are pruned.
6. **Restore decrypts before contacting any database**, so a wrong key fails with "No database was touched" (AC 2).
   Row counts via one `psql` query (`query_to_xml` per table), also available as `--counts-only` for the production
   side of the comparison.
7. **Logs**: one JSON line per event, `backup.dump.started|succeeded|failed` with a `reason`; tool stderr is reduced
   to headlines, `DETAIL`/`CONTEXT` lines (which can hold row values) dropped, URLs and passwords redacted. Missing
   variables log only their names (AC 3).
8. **Tests**: unit tests `packages/app/scripts/__tests__/backup.test.mjs` with a scripted `run` (100 % lines,
   branches, functions for `scripts/backup-*.mjs`, glob added to `test:scripts` and `coverage-scope.test.mjs`, AGENTS.md
   tooling list updated). End-to-end drill `backup-drill.e2e.mjs` (`yarn test:backup`): builds the job image, runs
   Testcontainers PostgreSQL 17 (pgvector, seed data incl. a `vector` column and a second schema) and an S3 server,
   generates age keys in the image, runs dump twice (same-day replace, monthly kept), restores, compares counts, wrong
   key, missing credentials (AC 1–3). New workflow `.github/workflows/backup-drill.yml` runs it on path changes and
   weekly; not a required check.
9. **MinIO is not pullable** (`minio/minio` pull access denied, `quay.io/minio/minio` 401) — used
   `versity/versitygw:v1.11.0` pinned by digest instead; lesson `s3-test-server-versitygw-not-minio`.
10. Not an `yarn test:integration:vereino` test: the drill needs no app build; it is a Docker test of ops scripts.

## Files changed

`scripts/backup-common.mjs`, `scripts/backup-dump.mjs`, `scripts/backup-restore.mjs`, `docker/backup/Dockerfile`,
`docker/backup/age-recipients.txt` (no key yet — owner action; the job refuses to run until one is added),
`railway.backup.toml`, `docs/ops/backups.md`, `.github/workflows/backup-drill.yml`,
`packages/app/scripts/__tests__/backup.test.mjs`, `packages/app/scripts/__tests__/backup-drill.e2e.mjs`,
`packages/app/scripts/__tests__/coverage-scope.test.mjs`, `packages/app/package.json` (`test:scripts` include,
`test:backup`), `package.json` (`test:backup`), `AGENTS.md`, spec changelog file, lesson, this log.

## Commands and results

- `yarn test:scripts` → 255 tests pass; `backup-common.mjs`, `backup-dump.mjs`, `backup-restore.mjs` 100/100/100.
  Earlier runs failed on a wrong expected prune count in my test (13 monthly copies keep 12 → 1 pruned) and on an
  uncovered `finally` branch (replaced by explicit cleanup).
- `yarn test:backup` → 3 tests pass (first try failed only because the Dockerfile path was relative to
  `packages/app`).
- `yarn lessons:check`, `yarn spec-changelogs:check` → valid. `yarn verify` → all 18 steps passed (build 60 s).

## Open problems / next steps (owner)

- Create the EU bucket and key, the age key pair (public key into `docker/backup/age-recipients.txt` by PR), and the
  Railway cron service with the variables in `docs/ops/backups.md`; run the first restore drill and record it in
  `docs/ops/restore-drills.md`.
- E18-S04 (#465) adds the log alert on `backup.dump.failed` / missing `backup.dump.succeeded` and `docs/ops/restore.md`.
- `pg_dump` receives the URL as an argument (visible in the process list of the single-purpose container only).
