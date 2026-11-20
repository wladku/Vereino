---
title: "A departure contributor's afterCommit only emits events; a synchronous write there waits on the departure's own locks"
modules: ["people", "facilities", "activities", "club_core", "payments"]
areas: ["architecture", "module-data", "debugging"]
topics: ["di-contracts", "transactions", "row-locks", "events", "role-sync"]
---

# A departure contributor's afterCommit only emits events; a synchronous write there waits on the departure's own locks

**Context**: Issue #307 (2026-11-20, people life-cycle phase L5). The `facilities` departure contributor's `afterCommit` called `people.roleSync.syncPerson` directly, as `facilities.place_maintainers.delete` does. In TEST-L06 the confirm took two minutes, the server logged `terminating connection due to idle-in-transaction timeout`, and the request answered 409 `departure_preview_stale` although the departure had committed (a fresh preview showed `already_left`).

**Problem**: `people.persons.depart` runs its contributors' `afterCommit` inside the command bus's execution, while connections that hold the departure's row locks (the locked person rows, the role assignments) are not released yet. A synchronous write from `afterCommit` (the role sync updates the person's roles) waits on those locks until Postgres kills the idle transaction; the failure then surfaces as a misleading error on a departure that already committed. Reads and event emission do not block, so the `groups` contributor never showed it.

**Rule**: A contributor's `afterCommit` emits its module's events (`emitAfterCommit`, `emitCrudSideEffects`) and nothing else: no command, no `people.roleSync`, no other write. Work that must follow (the derived roles) runs from subscribers of the events; the departure's own `people.*` events already start the `people` role sync (`people/subscribers/sync-auth-roles.ts`, `people.*.*`). When a request takes minutes and ends in an unexpected 409, look for `idle-in-transaction timeout` in the server log before suspecting the data.

**Applies to**: `packages/app/src/modules/*/services/departure-contribution.ts`, `people/commands/departures.ts`, any future contributor contract (`groups.season.<module>`) with an after-commit hook.
