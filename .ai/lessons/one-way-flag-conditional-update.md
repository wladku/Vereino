---
title: "A one-way flag on a row that authorizeScoped locks is set with a conditional UPDATE ... WHERE flag = false RETURNING, which also sets updated_at"
modules: ["communication"]
areas: ["module-data"]
topics: ["commands", "concurrency", "optimistic-lock", "sql"]
---

# A one-way flag on a row that authorizeScoped locks is set with a conditional UPDATE ... WHERE flag = false RETURNING, which also sets updated_at

**Context**: `communication.threads.mark_case` (foundation III phase C, #36, 2026-11-02) must answer 409 `case_already_open` to a second marking, also when two coordinators mark at the same time.

**Problem**: A read-then-write on the entity lets two concurrent requests with the same version both pass the check. A raw SQL update also bypasses MikroORM's `onUpdate`, so `updated_at` stays old and the response would carry a stale version token.

**Rule**: Set a one-way flag with a conditional `UPDATE … SET flag = true, updated_at = ? WHERE id = ? AND tenant_id = ? AND organization_id = ? AND flag = false RETURNING id`, treat zero rows as the 409, and return the `updated_at` you wrote as the new version. `authorizeScoped` still checks the lock token first, so a stale token answers `optimistic_lock_conflict` before the domain 409.

**Applies to**: one-way transitions on versioned Vereino records (cases, closings, seals).
