---
title: "The platform queue takes no job id: fence duplicate runs with values from the claim, not with a BullMQ jobId"
modules: ["foundation", "platform"]
areas: ["module-data", "architecture"]
topics: ["queue", "scheduled-jobs", "idempotency", "club-jobs"]
---

# The platform queue takes no job id: fence duplicate runs with values from the claim, not with a BullMQ jobId

**Context**: The many-clubs spec (DD-M04) planned BullMQ `jobId = <job_key>:<org>:<next_due_at>` so a re-enqueue of
the same due run is a no-op. `@open-mercato/queue` 0.9.0 `enqueue(data, { delayMs })` sets its own random id
(`strategies/async.js`), and the local strategy has no ids at all, so the dedupe cannot be expressed through the
platform queue (#629).

**Problem**: Bypassing the platform queue to reach BullMQ directly would split the two queue strategies (local in tests
and development, async in production) and duplicate its telemetry and abandon handling.

**Rule**: Put the claim into the job payload (`foundation/lib/club-job-run.ts`: the row's due time and the lease value
the sweep wrote) and compare them with `date_trunc('milliseconds', …)`: the claim travels as JS dates (milliseconds),
a row written by SQL (`now() - interval …`, a test fixture) holds microseconds, and an exact `=` then skips every run
(TEST-M06's first local run, #629) and start the run with a
conditional update on both (`startClubJobRun`); finish only while the run's own lease still holds
(`finishClubJobRun`). A copy enqueued before its lease was taken over, or one of a due time already done, matches
nothing and is skipped. Compute the next due time from `max(now, claimed due time)`, so a worker clock behind the
sweep's never re-runs the same slot.

**Applies to**: `packages/app/src/modules/foundation/services/club-jobs.ts`, `data/queries.ts`, any future
claim-and-enqueue sweep on the platform queue.
