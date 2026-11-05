# Issue #94: sessions list window, perspectives, row actions and the coordinator calendar

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task 2efb11d5), `om-auto-fix-issue` with the repo-local override applied (feature route; the covering specs are the club management spec and the scheduling primitives spec, so no spec PR); no subagents
- **Trigger:** `/om-auto-fix-issue 94` (E06-S12, epic #82)
- **Branch:** `feat/issue-94-sessions-list-calendar`, from `main` at 26bda24
- **Status:** completed, PR open for review.

## Goal

Sessions (B-15) opens on 7 days back through 14 days ahead instead of the oldest session; perspectives All / Canceled / Calendar (the coordinator's section calendar on the installed schedule family, V-8); row actions Cancel (reason required) for future planned sessions and Attendance list for started ones; a status badge and an empty text per perspective.

## Steps

1. Classified #94 as a feature (label `feature`). FR triage: open, unclaimed, no PR referencing it; the list had no default window, no perspectives and only an "Open" row action; `toScheduleItem` and `GET /api/activities/calendar?as=coordinator` existed but nothing rendered the coordinator `ScheduleView`. No migration, module, dependency or API change, so no Ask First item.
2. Claimed #94 (assignee, `in-progress`, 🤖 comment) and renamed the branch.
3. Pure logic `activities/lib/occurrence-list.ts` (perspectives, default window, row actions, reason rule, calendar range) with unit tests at 100 %.
4. `CancelOccurrenceDialog` extracted from `OccurrenceRecord` and shared with the list; the reason needs at least 3 characters and the confirm button stays enabled so the refusal is shown.
5. `OccurrencesTable`: perspective tabs in the URL, the default date filter, the Reason column on Canceled, the row actions, per-perspective empty text; `CoordinatorCalendar` (`ScheduleView` + section select, loading / error with retry / denied / empty).
6. en + pl strings; module README; club spec UI row and Changelog; scheduling spec status line and Changelog.
7. Integration test `activities/E06-S12-sessions-list-perspectives.spec.ts`; E03-S02 adjusted (the confirm button is no longer disabled while the reason is empty).
8. Platform axe baseline extended for the schedule family (react-big-calendar grid roles, the `ScheduleToolbar` date-range trigger); lesson `platform-crudform-labels-axe-baseline` updated.
9. Found while re-running E03-S02: the wizard's type select of #93 had no accessible name (critical `button-name` on the activity and event forms, failing E03-S02 on `main`); fixed with an `aria-label`.

## Decisions

- **Reason length on the client only.** The dialog asks for at least 3 characters (the issue's acceptance criterion); the API's `reason` schema stays 1–500, because tightening an accepted request body is a breaking contract change (`BACKWARD_COMPATIBILITY.md`).
- **"Today" is the browser's.** The default window and the calendar range use browser-zone dates, as the installed schedule grid buckets its days there; for the club's staff in its own zone this equals the club day. Reading the club zone first would cost a request that a coach without `club_core.view` cannot make.
- **Started = the start instant has passed** at the moment the page was read (`dataUpdatedAt`), so the actions match the rows shown. Both row actions need `activities.coach`, the gate the record page already used.
- **Perspective in the URL, filters in component state.** Switching perspectives remounts the list with the default window again; Canceled pins `status=cancelled` and hides the status filter.
- **Calendar filter bar holds the section only**, and slot clicks do nothing: the event wizard stays the way to a new one-off session. Recorded in the scheduling spec's Changelog.
- The scheduling spec stays `In progress`: its open item is closed, but AC-G01…AC-G08 still need their check-off, which is outside this story.

## Commands and results

- `npx jest src/modules/activities/lib/__tests__/occurrence-list.test.ts --coverage`: 12 passed; `occurrence-list.ts` 100 % lines, branches and functions.
- `yarn typecheck`: first run failed with missing `.mercato/generated` modules (fresh worktree); after `yarn generate` it passed. `yarn typecheck:qa`: pass.
- `yarn eslint src/modules/activities`: 1 error in my code (`restrict-template-expressions`, a number in a template literal); fixed.
- `yarn test:integration:vereino --filter E06-S12`, first runs failed, each fixed in the test or the page:
  1. `POST /api/activities/events {"type":"training",…,"code":"event_type_not_allowed"}` — a one-off event is not a training; then `type: 'event'` answered 400 (valid: training|match|sparring|tournament|camp|other) — the fixture uses `other`.
  2. `waiting for getByTestId('occurrences-perspective-all')` — `TabsTrigger` (0.9.0) does not pass `data-testid`; the test finds the tabs by role and name.
  3. axe on the calendar: `aria-required-children`, `aria-required-parent` (`.rbc-row-content`, `.rbc-allday-cell`) and `label-content-name-mismatch` (date-range trigger) — all installed schedule-family markup; baselined by rule and node.
  Then: 1 passed (1.5 min).
- While reading the first failures I also changed the calendar's initial range from Monday–Sunday to the locale's week via the family's `getScheduleLocale` (the grid renders the locale week; in English a Sunday would have shown the previous week).
- `yarn test:integration:vereino --filter J-003`: 1 passed (2.7 min).
- `yarn test:integration:vereino --filter E03-S02-activities-pages`: first run failed — `button-name` critical on `/backend/activities/activities/create` and `/backend/activities/activities/{id}` (the `activities-type-select` trigger); after the `aria-label` fix: 1 passed (2.0 min).
- `yarn verify`: all 13 steps passed.

## Lessons

- Updated: `platform-crudform-labels-axe-baseline` (schedule-family sources).

## Open problems

- None known.
