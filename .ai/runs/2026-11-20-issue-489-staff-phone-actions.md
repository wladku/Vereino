# Issue #489 — staff on the phone are offered only what they may do, and refusals name the way forward

- **Date:** 2026-11-20
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue`, Cezar run 537f6bca
- **Trigger:** the `cezar` label on #489 (E20-S10, epic #479)
- **Spec / issue / branch:** #489; no spec (bug route); branch `fix/issue-489-staff-phone-actions`
- **Status:** completed

## Goal

Hide the links and buttons a staff role cannot use on the phone, and make every refusal reached by URL name the next action in pl and en, without changing who may do what (scope of #489).

## Steps

1. Claimed #489 (assignee, `in-progress`, `🤖` claim comment naming this run).
2. Traced the four routes of the issue:
   - M-04 "Edit": `CoachSessionBlock` already follows the read's `mayEdit`, and `sessionActionFlags` uses the update command's own `mayEditSession`, so read and command agree (TEST-A16 already moves a session as the coordinator). The defect was the edit page's refusal: one coach-rule text ("A coach edits only… one-off events") for every reader and every reason, with no way forward.
   - `/club/events/new`: the calendar offered "New event" to everyone in the staff context and the Today coach tile to everyone acting as staff, while the form only takes groups the person coaches.
   - `/club/messages/new`: the empty state always showed the guardian text.
   - `/club/places/maintenance`: the page meta required `facilities.maintenance.manage`, so the catch-all rendered the platform's bare "Access denied" before the page's own 403 state; nothing links an attendant there (the Places link follows `maintenance.canPlan`, the notification goes to maintainers).
3. Fixes:
   - `activities/lib/session-edit.ts`: `sessionEditRefusal` / `sessionEditRefusalOfCode` — reason `not_yours`, `not_planned`, `club_event_part`, `coach_series`; the edit page renders one refusal per reason (the calendar link for `not_yours`), also for a 403 save.
   - `activities/lib/member-session.ts`: `coachesAGroup`, `organizesClubEvents`; "New event" in the calendar and the Today coach tile only for a person in the `coach` context; `/club/events/new` without a group (or a 403 options read) names the way: a new club event for a coordinator/administrator, the section coordinator otherwise.
   - `communication/lib/member-inbox.ts`: `isStaff`; `/club/messages/new` tells staff to write an announcement (Session → "Message the group", or "New announcement").
   - Page guards of `/club/places/maintenance`, `/club/events/new` and `/club/occurrences/[id]/edit` reduced to what every member holds; their reads keep the feature checks (unchanged routes) and the pages show their own refusals. The maintenance refusal names who assigns a maintainer (panel: Facilities → Maintenance → Maintainers).
4. Unit tests for the new lib functions; integration test `TEST-489` (coach, coordinator, facility attendant; en/pl; light/dark; 375 px; axe; no `auth.accessDenied.title`), with optional screenshots (`EVIDENCE_DIR`).
5. Lesson `member-page-refusals-belong-to-the-page`.

## Decisions

- Page guards relaxed rather than a new permission: the issue forbids changing who may do what; the API routes keep `activities.events.create`, `activities.coach`, `facilities.maintenance.manage`, so no data or action is newly reachable.
- "New event" is gated on the acting context `coach` (no extra request), matching the options read, which lists only coached groups.
- The member's language comes from `preferredLocale`, not the cookie: the test sets it through `PUT /api/people/me` so both locales are really checked.

## Files changed

- `packages/app/src/modules/activities/{components/club/ClubSessionEditPage.tsx,components/club/ClubEventPage.tsx,components/club/ClubCalendarPage.tsx,widgets/injection/club-today/widget.client.tsx,lib/session-edit.ts,lib/member-session.ts,lib/__tests__/*,i18n/*,frontend/club/events/new/page.meta.ts,frontend/club/occurrences/[id]/edit/page.meta.ts}`
- `packages/app/src/modules/communication/{components/club/ClubNewMessagePage.tsx,lib/member-inbox.ts,lib/__tests__/member-inbox.test.ts,i18n/*}`
- `packages/app/src/modules/facilities/{frontend/club/places/maintenance/page.meta.ts,i18n/*}`
- `packages/app/.ai/qa/tests/activities/TEST-489-staff-actions-and-refusals.spec.ts`
- `.ai/lessons/member-page-refusals-belong-to-the-page.md`

## Commands and results

- `yarn typecheck` — pass.
- `npx jest` on the three touched lib test files — 38 passed.
- `yarn test:integration:vereino --filter TEST-489` — first run failed: `POST /api/activities/activities` 422 `recurrence_invalid` (`byday_empty`); fixed the test's rule with `BYDAY`; then 1 passed (1.6 m); after the locale fix 1 passed (1.8 m).
- `yarn test:integration:vereino --filter TEST-A16 --no-build` — 1 passed; `--filter TEST-M13 --no-build` — 1 passed.
- `yarn verify` — first run failed at `format:check` (`ClubSessionEditPage.tsx is not formatted`); `yarn format`, then `yarn verify --from format:check` — all passed; final full `yarn verify` before the commit — all 18 steps passed.

## Open problems

- The query-index `QueryIndexScopeError` lines in the integration logs are pre-existing platform noise, unrelated.
- A Cezar autosave commit made during a usage-limit pause was folded into the signed-off commit.

## Next steps

- Review and merge the PR; the other E20 stories (#479) continue separately.
