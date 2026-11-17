---
title: "A QA probe that executes an update command passes the lock token as ctx.request's header"
modules: ["foundation", "groups"]
areas: ["testing"]
topics: ["integration-probe", "optimistic-lock", "command-bus"]
---

# A QA probe that executes an update command passes the lock token as ctx.request's header

**Context**: TEST-A02 (#266) ran `groups.groups.update` through `commandBus.execute` in a probe process (`_fixtures/groups-usage-probe/probe.mjs`) with a hand-built context copied from the payments probes. The first run answered 400 `lock_token_required`, although the same change passed through the API.

**Problem**: `authorizeScoped` requires the client's lock token for every loaded target (`lock: 'updated_at'`, the default) and reads it from `ctx.request` (the platform optimistic-lock header) unless the spec's `expectedUpdatedAt` takes it from the input. The payments probes only create records or replay undo (replay skips the check), so their context has no `request` and is not a template for an update.

**Rule**: In a probe that executes an update or delete command, add `request: new Request(url, { headers: { 'x-om-ext-optimistic-lock-expected-updated-at': <updatedAt> } })` to the context and pass the record's current `updatedAt` from the test. Never relax the command's lock rule to make a probe pass.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/*-probe/probe.mjs`, `foundation/services/authorize-scoped.ts`.
