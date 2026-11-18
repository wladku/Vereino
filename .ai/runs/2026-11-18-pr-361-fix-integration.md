# Run: PR #361 — fix the failing integration shards

- **Trigger:** cezar `om-auto-fix-pr 361` (required checks `integration (shard 1/3)`, `integration (shard 3/3)` and `integration` concluded FAILURE on head `3a1903ab`).
- **Issue / PR / branch:** #272 / #361 / `feat/issue-272-coach-attendance-phone` (worked on a detached HEAD, pushed with `git push origin HEAD:feat/issue-272-coach-attendance-phone`).
- **Date:** 2026-11-18

## Goal

Bring the PR up to date with `main` and make the required integration checks green without weakening a test.

## Steps

1. Claimed the PR (`in-progress` + claim comment).
2. Read the failed job logs of run 44200553408:
   - shard 1: `E03-S04-coach-attendance-ui` failed (`toHaveURL …/attendance$`, received `…/occurrences/<id>?as=coach`); `TEST-A12-coach-sparring-phone-ui` flaky (axe `color-contrast` on `/club/events/new (en, dark)`, passed on retry).
   - shard 3: `J-002-training-declaration-attendance` step 5/6 and `E09-S05-staff-context-and-landing` failed the same way.
3. Classified as **test bug**: issue #272 explicitly changes the coach's calendar card — "the coach's card title opens the session page, and the card carries an 'Attendance list' button" (REQ-A13, M-02/M-03); `toCalendarItem` builds the title href as `sessionHref(id, 'coach')` and a secondary `attendance` link. The three older tests still clicked the title link expecting the attendance list.
4. Updated the tests to follow the "Attendance list" button (`uiText('activities.club.session.attendanceList', { exact: true })`) and, in E09-S05, to assert both hrefs — including the second, member-context assertion (the merged calendar keeps the coach entry for a shared session, `mergeCalendarEntries`), which the failing run never reached.
5. Merged `origin/main` (`bd65b24d`) — no conflicts.

## Decisions

- No product change: the new behaviour is the issue's acceptance criterion and is already covered by TEST-A19.
- TEST-A12 left as is: a single colour-contrast hit on a page this PR does not change, green on retry — a flake, not this PR's regression.

## Files changed

- `packages/app/.ai/qa/tests/activities/E03-S04-coach-attendance-ui.spec.ts`
- `packages/app/.ai/qa/tests/journeys/J-002-training-declaration-attendance.spec.ts`
- `packages/app/.ai/qa/tests/people/E09-S05-staff-context-and-landing.spec.ts`
- `.ai/runs/2026-11-18-pr-361-fix-integration.md`

## Commands and results

- `yarn test:integration:vereino --filter E09-S05` (with build) — 1 passed (2.9m).
- `yarn test:integration:vereino --filter E03-S04 --no-build` — 1 passed (2.7m).
- `yarn test:integration:vereino --filter J-002 --no-build` — 1 passed (3.1m).
- `yarn typecheck:qa` — exit 0; `yarn qa-texts:check` — 0 problems; `yarn format:check` — 0 unformatted.

## Open problems / next steps

- CI on the pushed head must confirm all three integration shards; the merge stays with `om-approve-merge-pr` behind the QA gate (`needs-qa`).
- TEST-A12 axe colour-contrast flake on `/club/events/new (en, dark)` — watch; file an issue if it repeats.
