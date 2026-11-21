---
title: "Next.js fills an unset or empty variable from packages/app/.env: a test of a missing variable removes one .env.example leaves commented out"
modules: ["platform"]
areas: ["testing"]
topics: ["integration-tests", "env", "boot-env", "next-start", "worktrees"]
---

# Next.js fills an unset or empty variable from packages/app/.env: a test of a missing variable removes one .env.example leaves commented out

**Context**: #462 added a boot check that refuses to start without a required variable (`packages/app/scripts/vereino-boot-env.mjs`, called from `src/instrumentation.ts`). Its integration test started `next start` with `DATABASE_URL` removed. It passed in a fresh worktree and timed out (server started normally) after `yarn verify`, because `yarn generate` (any `yarn mercato …` call) copies `.env.example` to `packages/app/.env` and Next.js loaded `DATABASE_URL` from it.

**Problem**: `@next/env` sets every variable of `.env` that the process environment leaves unset or empty, so deleting a variable or setting it to `''` in the child env does not remove it when the worktree has a `.env`. The result depends on whether some earlier command created that file. Separately, `yarn start` (platform `server start`) refuses to start a second server in the same app folder, so a test cannot start one next to the runner's own.

**Rule**: In a test that starts the Next.js app to prove a variable is missing, remove a variable that `.env.example` leaves commented out (for example the Redis URL with `CACHE_STRATEGY=redis`), or set a malformed value; never rely on deleting a variable `.env.example` defines. Start the extra server with `yarn next start --port <free>`, not `yarn start`. Shell entry points that call the check directly (`node packages/app/scripts/vereino-boot-env.mjs`, the Railway scripts) read no `.env` and can test any variable.

**Applies to**: `packages/app/.ai/qa/tests/platform/ENG-TEST-12-13-boot-env.spec.ts`, any integration test that spawns the app with a modified environment; related: lesson `mercato-cli-writes-env-and-storage`.
