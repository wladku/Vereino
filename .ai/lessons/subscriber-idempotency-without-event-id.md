---
title: "Event subscribers get no event id, so a persistent subscriber keys its idempotency on a value the event carries"
modules: ["communication", "activities", "platform"]
areas: ["module-data", "integration"]
topics: ["events", "subscribers", "idempotency", "dispatch"]
---

# Event subscribers get no event id, so a persistent subscriber keys its idempotency on a value the event carries

**Context**: The `communication:session-cancelled` subscriber of foundation III phase B (#35, 2026-11-02) must add one session thread message and one e-mail per cancellation, also when the event is replayed or delivered concurrently.

**Problem**: The spec said "keyed by event id", but the platform event bus passes a subscriber only the payload and the tenant/organization context; there is no event id.

**Rule**: Key the dispatch idempotency on the record id plus a value the emitter writes with the change (here the occurrence id and the `updatedAt` the cancellation set, `communication:cancel:<id>:<updatedAt>`), and serialize concurrent deliveries with a lock on the target row. A replay is a no-op; a later change of the same record is a new key.

**Applies to**: every persistent subscriber that sends messages or appends rows.
