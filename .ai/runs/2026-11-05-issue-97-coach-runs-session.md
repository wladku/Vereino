# Issue #97: a coach finds their sessions on Today and runs one from the phone

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run unattended under cezar; no subagents
- **Trigger:** `/om-auto-fix-issue 97` (E06-S15, epic #82)
- **Spec / issue / branch:** #97; club spec `.ai/specs/2026-10-20-vereino-club-management.md` (*UI architecture*, REQ-007, REQ-009, TEST-014); `feat/issue-97-coach-runs-session` from `main` at 75d999a
- **Status:** implemented; PR for review

## Goal

A coach opens `/club` and sees their sessions, opens the attendance list, and cancels a session from the phone. A coach who is also a guardian sees both perspectives. A coach of another group sees "This is not your session". A coach-only person is no longer sent to the admin panel.

## Steps

1. Read the issue and its comments. No open PR referenced #97, and nobody had claimed it. Claimed it (assignee, `in-progress`, 🤖 comment). Classified as a feature. As in #101 and #87, the club spec and the story's acceptance criteria were the brief, and the spec's *UI architecture* section was updated in the same PR.
2. Found what already existed:
   - E06-S19 (#101) had added a coach view of Today, but only behind the header's role switcher, linking straight to M-05.
   - M-05's "This is not your session" (the J-002 defect) was already fixed with `OWN_FORBIDDEN_STATE`. M-04 had no coach perspective at all.
   - The phone composer of E06-S20 (#102) does not exist yet. #102 is open and blocked on its own Q1.
3. Server:
   - `GET /api/activities/calendar/{id}?as=coach`: `staffCalendar` takes an optional session id; outside the coach's scope the route answers 403 `scope_denied`.
   - The cancel route answers `notified`, from `countCancellationNotified`. The cancellation audience is now one helper, shared with the in-app notice.
4. Pure logic, with unit tests:
   - `cancellationNotifiedCount`, `cancelReasonProblem` / `CANCEL_REASON_LIMITS` and `needsCoach` in `lib/activities-rules.ts`;
   - `sessionPerspectives` and `sessionPageView` in the new `lib/member-session.ts`.
5. UI:
   - `CoachSessionBlock` ("Running the session": summary, "Needs a coach", attendance list, cancel dialog).
   - `ClubSessionPage` reads the member and the coach perspective together.
   - The Today widget adds a coach tile beside the member tiles.
   - `coach` leaves `STAFF_CONTEXTS` in `@vereino/ui`.
   - en and pl labels.
6. Tests:
   - new integration test `activities/E06-S15-coach-runs-session.spec.ts`;
   - E06-S19 follows the coach tile and the missing admin panel link;
   - `@vereino/ui` tests updated for the staff contexts.
7. Docs: the club spec's *UI architecture* and Changelog, and the module README.
8. Opened PR #176 (labels `review`, `feature`, `needs-qa`, `priority-high`, `risk-high`). The lock moved from the issue to the PR.
9. Review by a fresh subagent on the PR diff. Nothing blocking. Fixed:
   - the cancel route's count can no longer turn a committed cancellation into an error (it falls back to 0);
   - the cancel dialog starts empty when opened again;
   - the coach tile has a retry button and the "Open the calendar" link.
   Left as documented: `notified` counts people with neither an account nor an e-mail address. Counting only the people reached would need an e-mail field on `people`'s person-directory contract, beyond this story.

## Decisions

- **Union, not a replacement.** The coach tile is added whenever the person has the `coach` context. Acting as a member (the default) also shows the member tiles. Acting as a coach shows only the coach tile, so the #101 switcher keeps a meaning.
- **M-04 reads both perspectives** whenever the person coaches, whatever `?as=` says. Without that, a coach who is also a guardian would get only one of the two blocks (acceptance criterion 5).
- **403 for a coach outside the scope** (not 404). The coach is staff, the attendance list already answers 403 for the same case, and the page needs to tell "not yours" from "not in your calendar". A member's 403 (a person who is not theirs) still reads as not found.
- **The reason length 3–200 is the page's rule.** The API keeps 1–500, because the backend record cancels through it and narrowing it would break a shipped contract (`BACKWARD_COMPATIBILITY.md`).
- **`notified` is an added response field** (additive, not breaking). It counts the people the cancellation concerns (participants, guardians of minors, coaches), without the canceller: they are told in the app when they have an account and by e-mail when they have an address (J-003). A person with neither is still counted.
- **The toast text** is "Session canceled — people notified: {n}". The catalogs have no plural support, so the count follows a colon instead of "{n} people".
- **"Needs a coach"** means planned with no coach assigned. Absence reports (#95) will add the other route into that state.
- **"Message the group" is not in this PR.** It depends on the phone composer of E06-S20 (#102), which the issue names as its source and which does not exist yet. Linking a coach into the backend composer would contradict the issue's own rule (no admin panel for a coach-only person).
- **The calendar's coach items still open M-05 directly** (E03-S04 relies on it). Today's coach rows open M-04 and also carry an "Attendance list" button.

## Files changed

- `packages/app/src/modules/activities/data/validators.ts`, `services/calendar.ts`, `services/cancellation-notice.ts`, `api/calendar/[id]/route.ts`, `api/occurrences/[id]/cancel/route.ts`
- `packages/app/src/modules/activities/lib/activities-rules.ts`, `lib/member-session.ts` (new), `lib/__tests__/activities-rules.test.ts`, `lib/__tests__/member-session.test.ts` (new)
- `packages/app/src/modules/activities/components/club/club-client.ts`, `ClubSessionPage.tsx`, `CoachSessionBlock.tsx` (new), `widgets/injection/club-today/widget.client.tsx`
- `packages/app/src/modules/activities/i18n/en.json`, `pl.json`, `README.md`
- `packages/ui/src/member/member-nav.ts`, `src/__tests__/member-nav.test.mjs`, `src/__tests__/member-shell.test.mjs`
- `packages/app/.ai/qa/tests/activities/E06-S15-coach-runs-session.spec.ts` (new), `people/E06-S19-member-shell.spec.ts`, `_fixtures/attendance.ts` (the instructor's e-mail in the type)
- `.ai/specs/2026-10-20-vereino-club-management.md`

## Commands and results

- `yarn generate`: completed (the fresh worktree had no `.mercato/generated`, so the first `yarn typecheck` failed with "Cannot find module '@/.mercato/generated/…'").
- `yarn typecheck`, `yarn typecheck:qa`: passed.
- `npx jest src/modules/activities/lib --coverage`: 6 suites, 56 tests passed, 100 % on every file.
- `@vereino/ui` `yarn test`: the first run failed. `member-shell.test.mjs` expected the admin panel for `['self', 'coach']`; it now uses `coordinator`. Then 100 / 100 passed, 100 % coverage.
- `yarn verify`: all 13 steps passed on the first full run (build 178 s).
- `yarn test:integration:vereino --filter E06-S15`: 1 passed (1.7 min) on the first run.
- `yarn test:integration:vereino --filter E06-S19`: 1 passed (1.3 min).
- After the review fixes: `yarn verify` passed all 13 steps again, and `--filter E06-S15` passed again (1 passed, 1.7 min). That log also shows one `EPERM … queue.lock` polling error of the local file queue (a Windows file lock); the test passed.
- Both runs log the platform's `QueryIndexScopeError` for `directory:organization` and `auth:role` while the fixture deletes the club. It comes from the installed indexer, not from this change (also seen in #87's run).

## Open problems / next steps

- "Message the group" on M-04 lands with #102 (E06-S20).
- The `notified` count counts a person with neither an account nor an e-mail address. Counting delivered messages would need `communication`'s delivery list, which arrives after commit.
