---
title: "Delayed queue jobs do not cap a rate: jobs that run late become due together, so enforce the limit where the send happens"
modules: ["foundation"]
areas: ["integration", "testing"]
topics: ["queue", "dispatch", "rate-limit", "delay", "ci-flake"]
---

# Delayed queue jobs do not cap a rate: jobs that run late become due together, so enforce the limit where the send happens

**Context**: #633 (PR #726) paced each club's e-mail at 2 per second (many-clubs spec DD-M10) only by enqueuing every
delivery job with a growing `delayMs`. TEST-M08 passed locally but failed twice on the CI shard: club A sent 4 e-mails
inside one second (the test allows the burst of 2 plus one).

**Problem**: A delay is a "not before" time. When the worker is slow (a cold first job, a busy CI runner, a queue
backlog), the jobs whose times have passed are all taken in the next round and sent back to back, so the rate in a
second goes above the plan while the average still looks right. The fast local run hides it.

**Rule**: Use enqueue delays to spread jobs out, but enforce a rate limit at the point of the side effect: in the worker,
next to the send (`createClubSendRateLimiter` keyed by organization, taken before the process's own
`createSendRateLimiter` so a waiting club holds no process slot). Timing tests then check the limiter's guarantee, not
the scheduler's punctuality.

**Applies to**: `foundation/services/dispatch-worker.ts`, `foundation/lib/dispatch-rules.ts`
(`paceClubEmails`, `createClubSendRateLimiter`), `.ai/qa/tests/club_core/TEST-M08-club-limits.spec.ts`; any future
per-club or per-provider pacing built on queue delays.
