---
title: "Declare a uuid[] column with columnType; serialize capacity checks with a per-organization advisory lock"
modules: ["activities", "platform"]
areas: ["module-data"]
topics: ["mikro-orm", "migrations", "postgres-arrays", "advisory-lock", "concurrency", "conflicts"]
---

# Declare a uuid[] column with columnType; serialize capacity checks with a per-organization advisory lock

**Context**: Issue #31 (2026-10-29) added `activities_activities.invited_external_team_ids` and the place and coach conflict checks that every schedule write runs.

**Problem**: (1) MikroORM `type: 'uuid[]'` generates a `text[]` column, not the spec's `uuid[]`. (2) A conflict check reads the place's and coach's sessions and then writes; two concurrent writes for different rows both pass, and no row lock or unique index covers "at most N groups on a place at once".

**Rule**: Declare such a column as `type: 'text[]', columnType: 'uuid[]'` and check the generated SQL. Take `pg_advisory_xact_lock(hashtext('<module>.<area>:' || organization_id))` at the start of every write transaction that runs a capacity or conflict check, so the writes of one club are serialized and other clubs are unaffected.

**Applies to**: array columns in Vereino entities; `activities/data/queries.ts` and any later capacity check (substitutions, bookings).
