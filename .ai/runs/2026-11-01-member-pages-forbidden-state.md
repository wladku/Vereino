# Pages that render their own 403 state never reached it

- **Date:** 2026-11-01
- **Agent / tool:** Claude Code (Opus 5.5), coordinator session, no subagent
- **Trigger:** the J-002 exit-gate test (#22, PR #68) found that a coach from outside the group sees the attendance page's generic load error instead of "This is not your session". Owner decision: "Yes, fix it".
- **Branch:** `fix/member-pages-forbidden-state`, stacked on `test/issue-22-j002-journey` (PR #68)
- **Status:** completed. PR open for review.

## Cause

The platform `apiFetch` (`@open-mercato/ui/backend/utils/api`) throws `ForbiddenError` on every 403 unless the request sends `x-om-forbidden-redirect: 0`. Every Vereino read that maps a 403 to a page state after `apiCall` therefore had a dead branch, and the user saw the load error instead:

- **Member pages** (`activities/components/club/club-client.ts`):
  - the session (`useMemberSession`);
  - the coach attendance list (`useAttendanceList`);
  - the guardian contacts (`useGuardianContacts`).
- **Backend record pages:**
  - `people/components/PersonRecord.tsx`
  - `people/components/imports/ImportRecord.tsx`
  - `groups/components/GroupRecord.tsx`
  - `activities/components/ActivityRecord.tsx`
  - `activities/components/OccurrenceRecord.tsx`

## Change

- **New constant:** `OWN_FORBIDDEN_STATE` (`{ headers: { 'x-om-forbidden-redirect': '0' } }`), added to `components/client-helpers.ts` of `people`, `groups` and `activities`.
- **Call sites:** all eight reads above pass it to `apiCall`. Their 403 branches now run, so the page shows its own denied or not-your-session state.
- **Test:** the J-002 test now asserts "This is not your session" and the absence of the load error. Before, it accepted either.
- **Lesson:** `apifetch-403-throws-before-page-branch` names the helper.

## Commands and results

- `yarn test:integration:vereino --filter J-002`: 1 passed with the stricter assertion.
- `yarn test:integration:vereino`, whole suite: 85/85 passed (26.7 min).
- `yarn verify`: 13/13 passed after the lesson count of PR #68's merge of `main` was corrected on that branch.

## Open problems

- Only the attendance page's forbidden state is asserted in the UI. The backend record pages' denied states are not exercised by an integration test, because no existing scenario makes those reads answer 403.
