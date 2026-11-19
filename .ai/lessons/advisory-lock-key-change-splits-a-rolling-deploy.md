---
title: "Renaming an advisory lock key stops serializing old and new instances during a rolling deploy"
modules: ["foundation", "activities", "facilities"]
areas: ["module-data"]
topics: ["advisory-lock", "concurrency", "deploy", "occupancy"]
---

# Renaming an advisory lock key stops serializing old and new instances during a rolling deploy

**Context**: PR #210 (#122) moved `activities`' `lockSchedule` from the key `activities.schedule:<org>` to the shared occupancy key `vereino.occupancy:<org>` (`foundation/services/occupancy.ts` `lockOccupancy`, facilities spec DD-43). The review of #221 noted that while old and new instances run side by side, an old instance locks the old key and a new one the new key, so their session writes do not serialize against each other.

**Problem**: `pg_advisory_xact_lock(hashtext(key))` only serializes callers that hash the same key. A key change is invisible in the diff of any caller and passes every test, because a test runs one version of the code.

**Rule**: Treat an advisory lock key as a contract between running instances. Do not rename one casually; when a rename is needed (as for DD-43), either take both the old and the new key for one release, or ship it in a release that stops every old instance before new ones accept writes, and say which in the PR. The #210 rename needs nothing more now: every running instance takes `vereino.occupancy:`.

**Applies to**: `lockOccupancy` (`foundation`), `lockSchedule` (`activities/data/queries.ts`), `lockForOccupancy` (`facilities/commands/shared.ts`) and any later `pg_advisory_xact_lock` key.
