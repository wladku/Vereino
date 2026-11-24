---
title: "The audit actions list shows another user's entries only with audit_logs.view_tenant"
modules: ["platform", "activities", "communication", "people"]
areas: ["testing"]
topics: ["audit-logs", "acting-role", "acl", "integration-tests"]
---

# The audit actions list shows another user's entries only with audit_logs.view_tenant

**Context**: ISSUE-139 (#139, 2026-11-06) read a coach's `activities.occurrences.cancel` entry with the club administrator's token, to check the recorded `context.actingRole`. The entry was missing and the assertion received `undefined`. TEST-M12 (#138) had hit the same thing with a guardian's entry; that was recorded only inside `non-undoable-command-undo-test`.

**Problem**: `GET /api/audit_logs/audit-logs/actions` returns only the caller's own entries unless the caller holds `audit_logs.view_tenant`. The club administrator's platform role does not hold it, and members and coaches hold no `audit_logs.*` feature at all. A missing entry looks like a command that logged nothing.

**Rule**: To assert the acting role of another user's action:
- either grant the reader's role the tenant-wide view first — `setRoleAclFeatures(request, club.superToken, { roleId: club.tenant.roleId, features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.view_tenant'] })`, as E03-S01 does;
- or assert the role from the command's response (`actingRole`).

**Undo too** (TEST-A13, #271, 2026-11-17): the section coordinator's role holds no `audit_logs.undo_self` either, so `undoByToken` with the coordinator's token answers 403 `{"requiredFeatures":["audit_logs.undo_self"]}`. A test that needs an undo lets the club administrator make and undo the action (the administrator's role holds `undo_self`), or grants the feature first as above.

**Job and CLI commands too** (TEST-086, #471, 2026-11-22): an entry written by a job command (`jobCommandContext`, acting role `system`, e.g. `people.persons.anonymize` run by `people retention-sweep`) has no user, so the club administrator's token lists nothing for it either. Grant `audit_logs.view_tenant` as above before reading it; the run lost one integration round to this.

**Applies to**: integration tests under `packages/app/.ai/qa/tests/` that read `actionLogEntries` / `actionLogs` for an action someone else performed, a job or a CLI command performed.
