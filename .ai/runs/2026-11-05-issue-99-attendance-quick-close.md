# Issue #99: E06-S17, the attendance list in one tap, the close summary and the return to Today

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run by cezar (run cc30566f); no subagents
- **Trigger:** `/om-auto-fix-issue 99` (E06-S17, epic #82)
- **Branch:** `feat/issue-99-attendance-quick-close`
- **Status:** implemented; PR for review

## Goal

README M-05 (`/club/occurrences/[id]/attendance`): "All declared present"; a close confirmation that names the unmarked persons recorded absent, an early close and the credited coach; Ctrl/Cmd+Enter; the toast "Session closed — {n} present" and a return to `/club`; the empty state with a roster link for a coordinator; a sticky action bar on the phone.

## Steps

1. Read the issue (feature, no open questions, decision R11) and its comments; no open PR referenced #99. Claimed it with the assignee, `in-progress` and a `🤖` claim comment naming this run's worktree and branch.
2. Route: feature on a built screen, covered by the club spec (UI row `/club/occurrences/[id]/attendance`, the UI architecture's Ctrl/Cmd+Enter) and README M-05. Like #87, it went straight to implementation with a Changelog row in the club spec; no new spec.
3. Pure logic in `activities/lib/attendance-sheet.ts` with unit tests (100 %), then the page, i18n (en, pl), the module README, the new integration test and two updated tests.
4. `yarn generate`, `yarn typecheck`, `yarn typecheck:qa`, `yarn format`, `yarn lint`, the focused integration tests, then `yarn verify`.

## Decisions

- **No API change.** Closing sends every unmarked person as `absent` in the existing `entries` of `PUT /api/activities/occurrences/{id}/attendance` together with `complete: true`. The command and route stay as they were. The dialog warns about it first (R11: actual attendance is always recorded).
- **"Declared" = a final "yes".** A `pending_guardian` or `rejected_by_guardian` "yes" is not filled (the same rule as `effectiveDeclared`). The fill only changes the page's selections. Nothing is saved until Save or Close, so the coach can still correct a row.
- **The present count** in the toast counts `present` and `late` (the people who came), read from the list the save returns.
- **Credited coach:** the session's `coachName`. When the session has no coach, the dialog says the unit is not credited to anyone (DD-14 credits a unit to `coach_person_id`).
- **Early close:** the warning shows while `now < endAt`. The check-off opens only at the start, so in practice this means "still running".
- **Ctrl/Cmd+Enter** starts the same close flow (the confirmation first). The platform confirm dialog's own Ctrl/Cmd+Enter confirms it. A ref keeps a second close from starting while one is open.
- **Roster link:** shown to a coordinator and the club administrator (both manage the roster) and points to `/backend/groups/groups/{groupId}`, whose first tab is the roster.
- **Sticky bar:** `sticky bottom-24` above the member shell's fixed bottom navigation on a phone (6 rem clears its 4 rem and a typical safe area; `ds:check` refuses an exact `calc()`), static from `sm` up.
- The existing E03-S04 and J-002 tests expected the list to stay open after closing. They now expect `/club` and then reopen the list to check that it is read-only.

## Files changed

- `packages/app/src/modules/activities/lib/attendance-sheet.ts` (new), `lib/__tests__/attendance-sheet.test.ts` (new)
- `packages/app/src/modules/activities/components/club/ClubAttendancePage.tsx`
- `packages/app/src/modules/activities/i18n/en.json`, `pl.json` (new keys; `flash.sessionClosed` replaced by `flash.sessionClosedCount`; `attendance.empty` reworded)
- `packages/app/src/modules/activities/README.md`
- `packages/app/.ai/qa/tests/activities/E06-S17-attendance-quick-close.spec.ts` (new), `E03-S04-coach-attendance-ui.spec.ts`, `journeys/J-002-training-declaration-attendance.spec.ts`
- `.ai/specs/2026-10-20-vereino-club-management.md` (Changelog row)

## Commands and results

- `npx jest src/modules/activities/lib/__tests__/attendance-sheet.test.ts --coverage`: 11 passed; `attendance-sheet.ts` 100 % statements, branches, functions and lines.
- `yarn typecheck`: the first run failed because `.mercato/generated` was missing in the fresh worktree and with `TS2345` (the page's `(row: AttendanceRow) => …` was not assignable to the lib's `CurrentMark`). Fixed by making the helpers generic over the row type and running `yarn generate`. Second run: clean.
- `yarn typecheck:qa`: clean.
- `yarn lint`, first run: 1 error, `Invalid type "number" of template literal expression` in the unit test. Fixed with `String(i)`.
- `yarn test:integration:vereino --filter E03-S04`: 1 passed. `--filter J-002`: 1 passed.
- `yarn verify`, first run: failed at `ds:check` with `[arbitrary-tailwind] Use the design-system scale instead of arbitrary Tailwind values` (the sticky bar's `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`). An inline `style` instead failed with `[inline-style] Use shared components and design tokens instead of inline style props`. Fixed with the scale class `bottom-24`; lesson `sticky-bar-above-member-bottom-nav-uses-spacing-scale`.
- `yarn verify`, full run after the fix: all 13 steps passed.
- `yarn test:integration:vereino --filter E06-S17`: 1 passed (1.9 min) before the `bottom-24` change; re-run after it: 1 passed (1.6 min). The log shows the known platform `QueryIndexScopeError` from `query_index.delete_one` during fixture cleanup (also recorded in the #87 run). It does not come from this change.

## Open problems / next steps

- None known. The owner may want the toast count to exclude `late`; that is a one-line change in `presentCount`.
