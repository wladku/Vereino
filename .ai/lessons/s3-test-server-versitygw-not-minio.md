---
title: "Use Versity S3 Gateway, not MinIO, as the S3 server in Docker tests"
modules: ["platform"]
areas: ["testing"]
topics: ["s3", "testcontainers", "docker-images", "backup"]
---

# Use Versity S3 Gateway, not MinIO, as the S3 server in Docker tests

**Context**: The backup restore drill (#464, `packages/app/scripts/__tests__/backup-drill.e2e.mjs`) needed an
S3-compatible server in Testcontainers. The issue suggested MinIO, but on 2026-11-20 `docker pull minio/minio` failed
with "pull access denied" and `quay.io/minio/minio` answered 401: MinIO no longer publishes community images.

**Problem**: Tests and docs that name a MinIO image fail at pull time on any fresh machine or CI runner, before any
assertion runs.

**Rule**: For an S3-compatible server in a container test, use `versity/versitygw` pinned by tag and digest
(`… --access <key> --secret <secret> --port :7070 posix --nometa /tmp`), and create the bucket with the client under
test (`rclone mkdir :s3:<bucket>`). Check that a suggested image still pulls before designing a test around it.

**Applies to**: Docker-based tests of `scripts/backup-*.mjs` and any future S3 or file-storage integration test.
