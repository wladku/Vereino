# Run log — #490 E20-S11: an empty message shows what is missing

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` for #490 (label `cezar`, 2026-11-20). On `/club/messages/new` "Send" was grey and disabled while subject and text were empty, with nothing saying what was missing (R04.1, R04.3 of `docs/ux-concept/references.md`).
- **Issue / epic:** #490, epic #479 (owner decisions of 2026-11-20).
- **Branch:** `fix/issue-490-empty-message-shows-missing`.
- **Route:** bug chain (`bug` label); `backend-ui` (member forms) + `testing` (integration coverage). No spec: a UI bug fix (`direct`).

## Steps

1. Claimed #490 (assignee, `in-progress`, `🤖` claim comment naming the worktree, branch and start time).
2. Searched for an existing error summary component: none (`tokens.md` lists R04.2 "error summary" as a Vereino component still to build).
3. Built `ErrorSummary` and `FieldErrorMessage` in `@vereino/ui` (`src/member/error-summary.tsx`) with a framework-free model (`error-summary-model.ts`: `fieldErrorId`, `problemOf`, `fieldProblemProps`, `focusField`, `focusFirstProblem`, `focusOnClick`) and unit tests at 100 % coverage. Two modules use it (communication, people), so it belongs in the shared package.
4. Listed the `/club` forms that disabled submit while input was invalid and changed them:
   - `communication/components/club/ClubNewMessagePage.tsx` (M-06/M-07 "Write to the coach"): summary + field errors, focus to the first missing field.
   - `communication/components/ThreadMessages.tsx` `ReplyBox` (thread reply, `/club` and the panel thread): field error, focus back to the field.
   - `communication/components/ThreadMessages.tsx` `MessageEditor` (edit one's own message): an emptied text shows the field error; an unchanged text just closes the editor instead of a disabled "Save".
   - `people/components/club/ClubLeavePage.tsx` (leave request): summary when nobody is chosen or the last day is past; focus to the first person or the date.
5. Left as they are, with the reason:
   - `facilities/components/slot/SlotDialog.tsx` — disabled only while the end time is invalid, and a visible message next to the field already says why (R04.3 allows that).
   - `activities/components/club/ClubEventFilesBlock.tsx` — the funder logo upload is a file picker, not a form submit; the name hint under the field says what is needed.
   - `ClubAttendancePage`, `CoachPaymentsPage`, `ClubPaymentsPage`, `MoveChildrenDialog` — disabled while nothing changed, loading or nothing to do, not for invalid input.
6. Integration coverage extended: TEST-M13 (empty send, partial send, summary links, axe on the error state in pl/en, light/dark, 375 px), TEST-M10 (empty reply), TEST-L05 (leave with nobody chosen), TEST-L13 (emptied edit).

## Decisions

- Focus goes to the first invalid field, as the issue's acceptance criterion says, not to the summary (R04.2's default). The focused field reads its own error through `aria-describedby`.
- The summary is a labelled `section`, not `role="alert"`: an independent review found that its list follows the typing after a failed send, so an alert would be read out again on every keystroke.
- Required fields carry `aria-required`.
- Forms set `noValidate`, so the browser's own (English, unstyled) required bubbles never replace the summary.
- New catalog keys in `communication` and `people` (en + pl).

## Commands and results

- `yarn verify`: all 18 steps passed (before the review fix and again after it).
- `yarn test:integration:vereino --filter TEST-M13`: 1 passed; `TEST-M10`: 1 passed; `TEST-L05`: 1 passed; `TEST-L13`: 2 passed. TEST-M13 and TEST-L05 were run again after the review fix.
- Screenshots come from a TEST-M13 run with temporary screenshot lines (not committed). They are on the branch `qa-evidence-issue-490`.
- PR #507; the review was done by an independent subagent. It found no blocking defects and four minor points; the alert re-reading point and the `aria-required` point were fixed.

## Open problems / next steps

- None known.
