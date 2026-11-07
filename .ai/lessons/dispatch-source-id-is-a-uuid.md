---
title: "A foundation dispatch's source.id is a uuid; a business number goes in the idempotency key"
modules: ["foundation", "payments"]
areas: ["module-data", "debugging"]
topics: ["dispatch", "email", "idempotency"]
---

# A foundation dispatch's source.id is a uuid; a business number goes in the idempotency key

**Context**: Issue #114 (2026-11-07) e-mails the payer a confirmation of cash with its `KP/YYYY/MM/NNN` receipt number. The command passed the receipt number as the dispatch's `source.id`. Typecheck, lint and unit tests passed. The first integration run answered 500: `invalid input syntax for type uuid: "KP/2026/11/001"`.

**Problem**: `DispatchRequest.source.id` is typed `string`, but the outbox column it is stored in is a `uuid`. Only a real insert shows the mismatch, so mocked tests never catch it, and the whole command transaction rolls back.

**Rule**: Give `source.id` the id (uuid) of a row the dispatch is about. When one business event spans several rows (a receipt over several payments), use the first row's id, with a `type` naming that row's entity (e.g. `payments:payment`). Put the human or business number in `idempotencyKey` and in the template params. Prove a new dispatch with an integration test, not only with unit tests.

**Applies to**: Every `foundationDispatch.enqueue` call (`communication`, `activities`, `payments` and the modules that follow), in `packages/app/src/modules/*/commands` and `services`.
