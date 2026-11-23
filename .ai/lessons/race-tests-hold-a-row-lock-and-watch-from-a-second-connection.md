---
title: "Race tests hold a row lock in one connection and watch pg_stat_activity from another"
modules: ["activities", "foundation"]
areas: ["testing"]
topics: ["integration-tests", "concurrency", "postgres", "advance-where"]
---

# Race tests hold a row lock in one connection and watch pg_stat_activity from another

**Context**: TEST-G03 (#589) races the job-driven command `activities.attendance.expire` against a guardian's decision on the same declaration. With no production test hook, the test orders the race itself: it opens a transaction, takes the declaration's row lock (`select … for update`), sends the decision (it queues on the lock), starts the job CLI (it reads the row as `pending_guardian`, then its conditional UPDATE queues behind the decision) and rolls back. The decision commits first, so `advanceWhere` updates 0 rows and the job reports `skipped`.

**Problem**: The first version polled `pg_stat_activity` / `pg_blocking_pids` on the same connection that held the lock. Three runs timed out "the expiry job never queued" with every backend shown `idle` and stale queries: `pg_stat_activity` is a snapshot taken once per transaction (`stats_fetch_consistency`), so a poll inside the locking transaction never sees a new waiter.

**Rule**: To make a race deterministic in an integration test, hold the row lock on one `pg` client (`DATABASE_URL` is in the Playwright env) and poll the waiters on a second client outside any transaction. Queue the side that must win first, wait until it shows `wait_event_type = 'Lock'` behind the lock holder, then start the loser and wait until it waits behind the holder or the winner (`pg_blocking_pids(pid) && array[holder, winner]`). Send the queued API call with `apiRequest(…, { timeout, retryTransport: false })`: the fixtures' 30-second timeout is shorter than a CLI boot and a transport retry would send the command twice.

**Applies to**: `packages/app/.ai/qa/tests/**` race tests of `advanceWhere` jobs and commands (`activities/TEST-G03-expiry-race-skipped.spec.ts`; facilities `expire_requests` and `advance_lifecycle` if they get one).
