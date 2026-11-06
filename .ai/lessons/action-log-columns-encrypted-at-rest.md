---
title: "Action log command ids and context are encrypted at rest, so tests read entries through the audit API or match on unencrypted columns"
modules: ["platform", "communication", "activities"]
areas: ["testing", "integration"]
topics: ["audit-logs", "action-log", "encryption", "integration-tests"]
---

# Action log command ids and context are encrypted at rest, so tests read entries through the audit API or match on unencrypted columns

**Context**: The E06-S21 integration test (#103, 2026-11-03) checked that deleting a message is recorded in the action log.

**Problem**: A raw SQL filter on `action_logs.command_id` found nothing: `command_id` and `context_json` are encrypted at rest, so they never equal a plain value in a `WHERE` clause. Reading the entries through the audit API works only for the actor's own entries and only for the club's platform role (lesson `non-undoable-command-undo-test`).

A second run hit it (#105, 2026-11-05): a test filtered `command_id` in SQL and searched `command_payload`, `snapshot_after` and `context_json` with `LIKE` for a raw link token — the filter found nothing, and the search "passed" without proving anything, because the columns hold ciphertext. A sessionless command (a personal link) writes entries without an actor, which the audit API shows to nobody.

**Rule**: In integration tests, find action-log entries by the unencrypted columns (`resource_kind`, `resource_id`, `parent_resource_id`, `actor_user_id`, `created_at`), or read them through the audit API as the platform-role actor when the command id or context must be checked. Never filter or text-search encrypted columns in SQL — a `LIKE` for a secret over ciphertext is vacuous. To prove a command kept its input out of the log (`replayable: false`), assert `command_payload is null` and `undo_token is null` on the row found by `resource_id`. Promoted to `AGENTS.md` (Never) after the second occurrence.

**Applies to**: integration tests of any Vereino command that asserts its action-log entry.
