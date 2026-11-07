---
title: "The audit actions list shows another user's entries only with audit_logs.view_tenant"
modules: ["platform", "activities", "communication"]
areas: ["testing"]
topics: ["audit-logs", "acting-role", "acl", "integration-tests"]
---

# The audit actions list shows another user's entries only with audit_logs.view_tenant

**Context**: ISSUE-139 (#139, 2026-11-06) read a coach's `activities.occurrences.cancel` entry with the club administrator's token, to check the recorded `context.actingRole`. The entry was missing and the assertion received `undefined`. TEST-M12 (#138) had hit the same thing with a guardian's entry; that was recorded only inside `non-undoable-command-undo-test`.

**Problem**: `GET /api/audit_logs/audit-logs/actions` returns only the caller's own entries unless the caller holds `audit_logs.view_tenant`. The club administrator's platform role does not hold it, and members and coaches hold no `audit_logs.*` feature at all. A missing entry looks like a command that logged nothing.

**Rule**: To assert the acting role of another user's action:
- either grant the reader's role the tenant-wide view first — `setRoleAclFeatures(request, club.superToken, { roleId: club.tenant.roleId, features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.view_tenant'] })`, as E03-S01 does;
- or assert the role from the command's response (`actingRole`).

**Applies to**: integration tests under `packages/app/.ai/qa/tests/` that read `actionLogEntries` / `actionLogs` for an action someone else performed.
