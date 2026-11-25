---
title: "Data shared across clubs lives in its own configured tenant behind one service; close sessions and delete clubs in tests the way the commands expect"
modules: ["training", "club_core", "activities", "foundation"]
areas: ["architecture", "testing"]
topics: ["library-tenant", "cross-tenant", "isolation-guard", "attendance-check-off", "delete-club", "eslint-test-results"]
---

# Data shared across clubs lives in its own configured tenant behind one service; close sessions and delete clubs in tests the way the commands expect

**Context**: #685 (training outlines spec phase 4) built the shared outline library: entries every club may read, written from many club tenants. Its integration tests closed sessions through the attendance check-off and deleted a club through `club_core offboard-club` / `delete-club`.

**Problem**: (1) Data meant for every club cannot sit in any one club's tenant, and a system-scope (`organizationId: null`) table is forbidden; the isolation guard's `read` probes also fail on purpose-shared data, because club B's publications change club A's answers. (2) The check-off `PUT /api/activities/occurrences/{id}/attendance` with `complete: true` answers 400 `attendance_version_required` when the lock token comes from `GET /api/activities/occurrences/{id}` read as the coach; the version to send is `occurrence.updatedAt` of the attendance list. (3) `delete-club --dry-run` refuses with `notice_running` like the real deletion, so a test moves `offboarding_delete_after` into the past before the dry run. (4) `yarn lint` scans `packages/app/.ai/qa/test-results` while an integration run writes its HTML report there and reports hundreds of hook errors in minified trace assets.

**Rule**: Put cross-club data in a dedicated tenant named by configuration and reach it only through one DI service that never takes a scope from a request (AGENTS.md exception for `trainingLibrary`); keep source club ids inside that service, delete a leaving club's rows there through `registerClubDeleteBeyondTenant`, and probe its routes with the isolation kind `library` (allowed club B data = `$B:library…` refs only). In tests, close a session with the attendance list's own version, end the offboarding notice before any `delete-club` call, and remove `.ai/qa/test-results` (or wait for the run) before linting.

**Applies to**: `training/services/library.ts`, `foundation/services/club-data.ts`, `club_core/services/club-offboarding.ts`, `.ai/qa/tests/_fixtures/library.ts`, `_fixtures/isolation/probe.ts`, `scripts/check-route-isolation.mjs`, `yarn lint`.
