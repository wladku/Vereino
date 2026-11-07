---
title: "Record whom a record is about on the record; participants and group snapshots cannot tell you"
modules: ["communication"]
areas: ["module-data", "debugging"]
topics: ["query-filters", "data-scoping", "guardians", "minors"]
---

# Record whom a record is about on the record; participants and group snapshots cannot tell you

**Context**: The guardian's ward filter on the member inbox (#177, #187) decided which ward a member's direct thread was about from its `group_id` snapshot and from the ward's participant row. Two wards in the same group (Hania and Kuba in Żaki) got each other's coach threads. A thread about Hania to the coordinator (no `group_id`) listed under no ward, because Hania has no account and so is never a participant.

**Problem**: A group snapshot says where a thread is visible, not whom it is about. A minor without an account is never a recipient, so the participant table cannot name them either. Narrowing the group match (#177) dropped the account-less ward's own threads instead. The fact was missing, and no query over the other columns could recover it.

**Rule**: When a read needs to know whom a record is about, the writing command stores the subject on the record when it is created. Here, `start_direct` stores it in `communication_threads.scope_id` for `direct` threads. Don't derive the subject from participants or permission snapshots. Records written before the subject was stored keep the old matching as an explicit `scope_id is null` fallback.

**Applies to**: `packages/app/src/modules/communication/data/queries.ts` (`visibleThreadHeaders`, ward clause), `commands/threads.ts` (`threads.start_direct`), any future "about a person" filter (guardians, wards, minors without accounts).
