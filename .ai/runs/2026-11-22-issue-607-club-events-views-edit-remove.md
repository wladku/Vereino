# Run log — issue #607: the club events list views, editing a part and removing an undeclared part (AC-T11)

- **Trigger:** Cezar run be460837 (`om-auto-fix-issue`), issue labelled `cezar`.
- **Issue:** #607 (epic #565). **Spec:** `.ai/specs/2026-11-18-vereino-club-events-with-parts.md`, AC-T11.
- **Branch:** `test/issue-607-club-events-list-views`.
- **Route:** `direct` (test only, no product code), `testing`.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read TEST-T11 (panel flow without the views, Edit or a successful Remove), `ClubEventsTable` (views `upcoming|past|cancelled` under `?view=`), the list route's view filter (`pastClubEventIds`: planned events whose every part ended), `ClubEventPartsTable` (Edit / Remove with the confirm dialog) and `ClubEventPartDialog` (edit of a group part: title, category, type, teams; times fixed; PUT with the lock token).
3. Added `packages/app/.ai/qa/tests/activities/ISSUE-607-club-events-views-edit-remove.spec.ts`: through the API an upcoming event with two group parts next weekend, a past event with an open part yesterday and a cancelled whole-club event; in the browser Upcoming lists only the first, the Past and Cancelled tabs list only theirs under `?view=` with no page reload (a window marker survives), `?view=past` in the address opens Past; on the record Edit renames the Orlik part and sets its category (PUT 200, the row and the record read show them); Remove of the undeclared Żak part is confirmed (DELETE 200, flash, row gone, one day heading left, the record has one part and the part session answers 404).
4. Spec changelog entry `.ai/specs/changelog/2026-11-18-vereino-club-events-with-parts/2026-11-22-issue-607-club-events-views-edit-remove.md`.

## Decisions

- **A sibling `ISSUE-607` file rather than growing TEST-T11:** TEST-T11 already runs a 900 s budget through the axe matrix; a separate test keeps both fast to rerun and leaves TEST-T11 untouched. The spec's status line and the AC-T11 tick stay with the close-out, which edits those lines.
- **Data through the API, the three asserted actions in the browser:** the gap was the UI of the views, Edit and Remove; creating events is already covered by TEST-T11 and TEST-T01.

## Commands and results

- `yarn test:integration:vereino --filter ISSUE-607` (first run) → failed at the cancelled row: `toContainText` got an `{ exact: true }` pattern, which is anchored and never matches a longer row text (AGENTS.md Validation already says so). Dropped `exact` there.
- `yarn test:integration:vereino --filter ISSUE-607` → `1 passed (43.0s)`.
- `yarn verify` → first run failed at `format:check` (the spec file formatted by root prettier, not `yarn format`); after `yarn format` → "[verify] all 20 step(s) passed".
- `yarn guard` → "No blocking findings."

## Open problems / next steps

- AC-T11 can be ticked by the close-out with TEST-T11, TEST-T08 and this test as evidence.
