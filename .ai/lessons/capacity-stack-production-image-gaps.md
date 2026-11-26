---
title: "The production Docker image runs no mercato CLI process, and the Next bundle cannot build the Redis cache client: a capacity stack runs the builder stage with the SQLite cache"
modules: ["platform", "foundation"]
areas: ["architecture", "debugging"]
topics: ["docker", "capacity", "redis", "cache", "railway", "cli"]
---

# The production Docker image runs no mercato CLI process, and the Next bundle cannot build the Redis cache client: a capacity stack runs the builder stage with the SQLite cache

**Context**: The capacity test of #633 (2026-11-25) ran the app, the worker and the CLI from `docker build --target runner`
of the root `Dockerfile` against local PostgreSQL and Redis.

**Problem**: Two failures, both on `main` before #633 changed anything:
- In the `runner` stage every `yarn mercato …` process (pre-deploy, `yarn start` = `mercato server start`, the worker)
  fails with `Cannot find package 'react' imported from /app/packages/ui/src/emails/EmailLayout.ts`: the stage installs
  only `@vereino/app`'s dependencies (`yarn workspaces focus @vereino/app --production`), and `packages/ui` source loaded
  outside the Next bundle resolves `react` from `packages/ui/`, where nothing is installed.
- With `CACHE_STRATEGY=redis` (the default of `scripts/railway-start.sh`) the Next production bundle throws
  `Class constructor Redis cannot be invoked without 'new'` in `@open-mercato/cache` on the first cached read (RBAC), and
  `/api/healthz` answers 503 for its Redis probe. The CLI and the worker, which are not bundled, construct it fine.

**Rule**: Until both are fixed (follow-up issues of #633), a local capacity or production-like stack runs the `builder`
stage image for app, worker and CLI, with `CACHE_STRATEGY=sqlite` on a volume shared by all three; the report says so.
Before trusting a deploy recipe in a test, start the exact image and command the deploy uses.

**Applies to**: `Dockerfile` (runner stage), `scripts/railway-start.sh`, `scripts/railway-worker.sh`,
`docs/ops/capacity.md`.
