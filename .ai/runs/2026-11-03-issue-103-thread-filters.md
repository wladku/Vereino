# Issue #103: thread filters by scope and section, last message, delete before a case, deliveries per message

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, one implementation subagent, and the coordinator's review and gate
- **Trigger:** `/om-auto-fix-issue 103` (E06-S21, epic #82), the first story of the backlog order agreed with the product owner
- **Branch:** `feat/issue-103-thread-filters`, from `main` at f9dc176
- **Status:** completed, PR open for review.

## Goal

A coordinator narrows the thread list to their section, sees how many messages a thread has and who wrote last, deletes a message before the thread becomes a case, and sees delivery results under every message (README B-18, B-19; club spec REQ-009, REQ-010; foundation III REQ-M05, REQ-M09; D29 phone-first).

## Steps

1. Claimed #103 and created a worktree from `main`.
2. **Subagent:** the filters, columns, delete action, per-message delivery counts and list, the API additions, en + pl, unit tests and the E06-S21 integration test; reran TEST-M05, TEST-M09, TEST-M10 and J-003.
3. **Coordinator review:** every API change is additive; `deliveryCountsOf` is narrowed to the tenant and organization; members get `deliveryCounts: null`; a section outside the reader's grants gives an empty page; deletion carries the thread version and keeps the case guard; no migration, module or dependency.
4. **Coordinator gate:** `yarn verify` and the whole integration suite; the foundation III spec's API row and one lesson added.

## Decisions

- A forged or foreign `sectionId` returns an empty page, not 403, and hides even threads the reader takes part in.
- Section options come from `GET /api/communication/audience/targets?kind=section` (all for the administrator, own sections for a coordinator, none for a coach).
- Recipients are collapsed per message except the first; counts are always visible (short on a phone).
- "Last message" counts original messages only; an edit or deletion is not a new message.

## Commands and results

- `yarn verify`: subagent 13/13; coordinator 13/13.
- Subagent, one id each: E06-S21 2 passed, TEST-M05, TEST-M09 (2), TEST-M10 and J-003 passed.
- **Whole suite, coordinator:** 99 passed, 2 failed (46.7 min). Both failures are TEST-009 (`activities`, untouched here): its fixture series runs on Tuesdays 17:00–18:30 on the pitch, and `startNow` moves another session of that series to "now"; the run was on Tuesday around 17:07 Warsaw time, so the move collided with today's session (409 place conflict). Time-of-day dependent, like the Sunday failures fixed in #67. Rerun after 19:00: 4 passed (2.1 min) at 19:05 club time, so the failure is the time-of-day collision, not this change.

## Lessons

- New: `action-log-columns-encrypted-at-rest`.

## Open problems

- TEST-009 fails on Tuesdays between about 15:30 and 19:00 club time (follow-up).
- Existing: the list's `lastMessageAt` leaves out the reader's own messages although its OpenAPI text says otherwise; `StatusBadge` (a `div`) sits inside `<p>` in the thread header and `MessageList`.
