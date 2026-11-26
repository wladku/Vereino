---
title: "A session's attendance-list closing time is not stored; read it from updated_at and the check-off action log"
modules: ["activities"]
areas: ["architecture", "module-data"]
topics: ["attendance", "action-log", "reports", "audit-logs"]
---

# A session's attendance-list closing time is not stored; read it from updated_at and the check-off action log

**Context**: E27-S03 (#820, 2026-11-26) needed "attendance recorded within 24 h of the end". The first run stopped: closing a list (`activities.attendance.mark` with `complete`) sets `activities_occurrences.status = 'done'` and moves `updated_at`, but no column keeps when it closed, and `activities.occurrence.completed` is not persisted.

**Problem**: `updated_at` of a done session moves again with later edits (the match result, a reopen and close), so it alone makes an on-time list look late; adding a `completed_at` column is a migration (Ask First). Raw SQL on `action_logs.context_json` finds nothing, because the column is encrypted (lesson `action-log-columns-encrypted-at-rest`).

**Rule**: For "when was the list closed by a deadline": a `done` session whose `updated_at` is on or before the deadline was closed by then; otherwise read the session's action-log entries up to the deadline through `actionLogService.list` (`resourceKind` `activities.occurrence`, `resourceId`, `before`), which decrypts them, and take the first whose context says `completed: true`; none means late. An undone check-off still counts, because the undo never reopens a closed list. See `activities/services/pilot-indicators.ts`. If an exact closing time becomes a product need, propose a `completed_at` column instead of widening this.

**Applies to**: `packages/app/src/modules/activities` reports and any read that needs a session's closing time.
