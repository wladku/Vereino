# Job image of the nightly off-site backup (engineering standards S15.7, issue #464) and of the restore drill.
# It holds only the two scripts, their shared helper, the age recipients file and the binaries they call:
# pg_dump/pg_restore/psql 17 (PostgreSQL client), age (encryption) and rclone (S3-compatible upload).
# No application code and no npm dependency. Base image pinned by digest (S14.2); bump tag and digest together.
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

RUN apk add --no-cache postgresql17-client age rclone ca-certificates

WORKDIR /backup
COPY scripts/backup-common.mjs scripts/backup-dump.mjs scripts/backup-restore.mjs ./scripts/
COPY docker/backup/age-recipients.txt ./docker/backup/age-recipients.txt

USER node
CMD ["node", "scripts/backup-dump.mjs"]
