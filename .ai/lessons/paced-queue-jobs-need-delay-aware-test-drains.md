---
title: "A job enqueued with a delay must wait in a test's queue drain: a probe that takes every job at once hands the worker rows that are not due yet"
modules: ["foundation"]
areas: ["testing", "integration"]
topics: ["queue", "dispatch", "integration-tests", "probe", "delay"]
---

# A job enqueued with a delay must wait in a test's queue drain: a probe that takes every job at once hands the worker rows that are not due yet

**Context**: #633 paced each club's e-mail (2 per second per club, many-clubs spec DD-M10): the dispatch writes a later
`next_attempt_at` on the delivery rows and enqueues each job with `delayMs`. The messaging probe
(`.ai/qa/tests/_fixtures/messaging-probe/probe.mjs`) drained its private local queue by reading `queue.json` and taking
every job, ignoring the `availableAt` the local strategy stores.

**Problem**: The worker leases a delivery only when it is due, so a delayed job run early ends `not_due` and the e-mail
is never sent inside the test; TEST-M02's 50-recipient case and every test with more than two recipients would fail
or count wrong attempts.

**Rule**: A test helper that drains a local queue by hand takes only jobs whose `availableAt` has passed and waits for
the next one (as the local strategy does). When a change starts enqueuing with `delayMs`, grep the fixtures for
`queue.json` and fix every hand-written drain in the same PR.

**Applies to**: `_fixtures/messaging-probe/probe.mjs` (`takeQueuedJobs`), `_fixtures/scheduled-job-probe/probe.mjs`,
`foundation/services/dispatch.ts` (`enqueuePacedEmails`).
