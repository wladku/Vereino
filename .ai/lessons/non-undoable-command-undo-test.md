---
title: "A non-undoable command leaves no undo token, and only the platform club role can read and undo action logs, so test an undo refusal on an action that role performed"
modules: ["communication", "platform", "audit_logs"]
areas: ["testing", "integration"]
topics: ["commands", "undo", "action-log", "audit-logs"]
---

# A non-undoable command leaves no undo token, and only the platform club role can read and undo action logs, so test an undo refusal on an action that role performed

**Context**: TEST-M09 of foundation III phase C (#36, 2026-11-02) had to show that marking a thread as a case "cannot be undone through the action log".

**Problem**: The platform records a command with `isUndoable: false` with no undo token at all, so there is no token to replay. `POST /api/audit_logs/audit-logs/actions/undo` answers 400 "Undo token not available" (`audit_logs/api/audit-logs/actions/undo/route.ts`). Only the club's platform role holds `audit_logs.view_self` and `audit_logs.undo_self`; a `vereino_*` coordinator cannot read their own log entry.

**Rule**: Test "not undoable" as the log entry's `undoToken === null` plus a 400 from the undo endpoint, and check that the record is unchanged afterwards. Run that check on an action the club administrator (platform role) performed; cover the coordinator's action through its response (acting role) and the refusal of a second action instead.

**Recurrence (2026-11-05, #138)**: TEST-M12 read a guardian's `communication.threads.start_direct` entry with the club administrator's token and got an empty list: `GET /api/audit_logs/audit-logs/actions` without `audit_logs.view_tenant` returns the caller's own entries only, and members hold no `audit_logs.*` feature. Assert a member's acting role from the command's response instead.

**Applies to**: every non-undoable Vereino command whose spec says the action log cannot reverse it.
