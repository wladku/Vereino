---
title: "A dispatch idempotency key names the transition, not only the record: the same e-mail may be due twice"
modules: ["enrolment", "foundation"]
areas: ["module-data"]
topics: ["dispatch", "idempotency", "e-mail", "integration-tests"]
---

# A dispatch idempotency key names the transition, not only the record: the same e-mail may be due twice

**Context**: #801 (phase 4 of the sign-up spec). `enrolment.trial_cancelled` was enqueued with the key
`enrolment:<applicationId>:trial_cancelled:<sessionId>`. In TEST-J10 a coordinator withdrew a proposed session, proposed
the same session again and the session was then cancelled: the second e-mail never arrived.

**Problem**: `foundationDispatch.enqueue` skips a dispatch whose idempotency key already exists. A key built from the
record and the template alone is right for retries of one command but wrong when the same state change can happen again
legitimately (re-proposed, re-cancelled, re-waitlisted); the later e-mail is silently dropped and only an end-to-end
test that repeats the cycle notices.

**Rule**: Build an applicant or member e-mail's idempotency key from the record, the event and something unique to the
transition — the row's new `updatedAt`, a link id, or the command's time — so a retry of the same transaction dedupes
but a later, separate transition sends. Keep repeat-safety of subscribers in the state check (move only rows still in
the source state), not in the dispatch key. A test that cycles a state twice should await the e-mail count (`count`
argument of `awaitEmails`).

**Applies to**: every `enqueueApplicantMail` / `foundationDispatch.enqueue` caller, especially in `enrolment`.
