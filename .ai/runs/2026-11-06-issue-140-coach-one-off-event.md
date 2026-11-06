# Issue #140: a coach creates a one-off event for their group from the phone (REQ-027)

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task 48312f5f), `om-auto-fix-issue` with the repo-local override; no subagents
- **Trigger:** `om-auto-fix-issue 140`
- **Spec / issue / branch:** #140; club spec `.ai/specs/2026-10-20-vereino-club-management.md` (REQ-027, AC-027, TEST-034, phase 2 step 8); `feat/issue-140-coach-one-off-event` from `main` at e646c15
- **Status:** implemented; PR for review

## Goal

A coach or instructor creates a tournament or another one-off event for a group they coach from the phone, without the coordinator: "New event" on the coach's calendar and on the coach tile of Today, a phone form, the session page after saving, conflicts listed with no "save anyway", 403 for a forged group.

## Steps

1. Read the issue and its comments. Nobody had claimed it and no PR referenced it. Claimed it (assignee, `in-progress`, 🤖 comment naming the worktree, branch and start). Classified as a feature. As in #97 and #101, the club spec and the issue's acceptance criteria were the brief; the UI contract was added to the spec in the same PR, as the issue asked.
2. Found what existed: `POST /api/activities/events` with its scope, type and conflict rules (#31), the backend form B-14 events (`EventForm.tsx`), the coach tile of Today and the coach calendar (#97, #101). The coach role holds `activities.events.create` and `groups.view` but neither `club_core.view` nor `groups.manage`, so the backend option sources (`/api/club_core/options/places` reads only for coordinators and the administrator) were closed to a coach.
3. Server: `GET /api/activities/events/options` (`activities.events.create`): the live active groups of the caller's `coach` grant with their section, and the bookable places through `clubCoreDirectory.placeOptions`. Two directory helpers in `services/directory.ts` (`placeOptions`, `listGroupsAmong`).
4. Pure logic with unit tests: `lib/member-event.ts` — `eventGroupOptions`, `eventPlaceOptions`, `eventDraftProblems`, `eventRequestBody` (club-zone wall times through `zonedInstant`), `eventFieldOfError`.
5. UI: `/club/events/new` (`ClubEventPage`, `ClubEventForm`), "New event" on the coach tile of Today and on `/club/calendar` acting as a coach, `newEventHref` with a proposed date, place and group for the phase 5 "Book for group"; `ConflictList` gained `linkSessions` (the member form names the colliding sessions without backend links); en and pl labels.
6. Test: `packages/app/.ai/qa/tests/activities/ISSUE-140-coach-one-off-event.spec.ts`.
7. Docs: the club spec (UI table row, API row, *UI architecture*, phase 2 step 8) with a changelog entry, the module README.

## Decisions

- **One options route in `activities`, not a wider `club_core` route.** Opening `/api/club_core/options/places` to coaches would change another module's feature gate and grant kinds; the form's route reads the places through `club_core`'s DI directory and gives names only. The groups come from the `coach` grant of the record scope, the same grant `POST /api/activities/events` authorizes against.
- **Own groups only.** The issue says "group (own groups only)". A coordinator or administrator keeps the backend wizard; on `/club` they see their coached groups, if any.
- **One day, start and end.** The issue's form has "date, start and end"; the API still takes a multi-day span from the backend form.
- **Invited teams for a tournament only.** REQ-027 gives a tournament its list of invited teams; `other` sends none. The teams come from `GET /api/groups/external-teams`, which a coach reads (`DICTIONARY_READ_KINDS`); a failure hides the field rather than blocking the form.
- **No links in the conflict list on `/club`.** The colliding session's page is the backend record, which a coach cannot open.
- **The calendar offers "New event" only acting as a coach** (the issue: "M-03, coach perspective"); the coach tile of Today always does.

## Files changed

- `packages/app/src/modules/activities/api/events/options/route.ts` (new), `services/directory.ts`
- `packages/app/src/modules/activities/lib/member-event.ts` (new), `lib/__tests__/member-event.test.ts` (new)
- `packages/app/src/modules/activities/components/club/ClubEventPage.tsx` (new), `club-client.ts`, `ClubCalendarPage.tsx`, `components/ConflictList.tsx`, `widgets/injection/club-today/widget.client.tsx`
- `packages/app/src/modules/activities/frontend/club/events/new/page.tsx`, `page.meta.ts` (new)
- `packages/app/src/modules/activities/i18n/en.json`, `pl.json`, `README.md`
- `packages/app/.ai/qa/tests/activities/ISSUE-140-coach-one-off-event.spec.ts` (new)
- `.ai/specs/2026-10-20-vereino-club-management.md`, `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-06-issue-140-coach-one-off-event.md`

## Commands and results

- `npx jest src/modules/activities/lib/__tests__/member-event.test.ts --coverage`: the first run had 98.07 % branches (the `?? ''` of the sort comparator was reached only on one side); after a sort-key helper, 13 tests passed with 100 % on `member-event.ts`.
- `yarn generate`: completed. `yarn typecheck`, `yarn typecheck:qa`: passed.
- `yarn lint`: two errors in the new files (`no-unnecessary-type-parameters` on a local generic helper, `no-unnecessary-type-assertion` on `draft.date as CalendarDate`); fixed, then clean for `activities`.
- `yarn test:integration:vereino --filter ISSUE-140`, first run: failed at `getByTestId('club-calendar-new-event')` (both attempts). Everything before it passed (options, Today → form in Polish, axe in light and dark, the 201 and the session page, both families' calendars). The coach acts as a member by default, so the calendar is the ward's and has no "New event"; the test now switches the header context to "Coach" first and also checks that the member calendar has no button.
- Second run: failed at `putMe(…, me.body?.person.updatedAt)` — `TypeError: Cannot read properties of undefined (reading 'updatedAt')` (both attempts). The conflict step now passed. `signInBrowser` sets a new password, so the fixture's API token for the coach no longer worked; the test now takes a fresh token with `getAuthToken(email, password)`, as TEST-M13 does.
- Third run: `1 passed (2.2m)`. The log shows the platform's `QueryIndexScopeError` for `directory:organization` and `auth:role` while the fixture deletes the club (installed indexer, also seen in #97's and #87's runs).
- `yarn verify`: all 14 steps passed on the first full run (build 92 s).
- Lesson `sign-in-browser-ends-the-api-token` updated with this recurrence (its fourth record); `node scripts/check-lessons.mjs` valid.

## Open problems / next steps

- The same `signInBrowser` token trap now has four lesson records; it is a candidate for an `AGENTS.md` rule or for `signInBrowser` returning the fresh token (suggested on the PR, not done here).
- Phase 5 "Book for group" (M-11, #123) opens `ClubEventForm` through `newEventHref({ date, placeId, groupId })`.
- The form takes one day; a weekend tournament still needs the backend form or two events.
