# Run: issue #290 — dashboard widget "Today at the facility" (E11-S16)

- **Goal and trigger:** Cezar run (task b6089fa6) started by the `cezar` label on #290; `om-auto-fix-issue` with the vereino override.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` phase 16 (REQ-R20, TEST-R20, AC-R16; README B-01, widget 8 of the navigation spec's role table) · #290 (epic #253) · `feat/issue-290-today-facility-entries-widget`.
- **Readiness:** the spec is `Ready for implementation` (owner approval of 2026-11-16 on #253, which also answered Q-R24: the widget follows the navigation spec's role table); #275, #260 and #276 are closed, so the `?place=&date=` click target exists. No migration, module, dependency or contract change.

## Steps

1. Claimed #290 (assignee, `in-progress`, `🤖` claim comment naming the worktree, branch and start time).
2. `lib/today-at-facility.ts` (pure, 100 % unit-tested): today's entries on the club's own places (an external place is not at the facility), by start then id, the first eight and the count of the rest, and the first entry's place.
3. `widgets/dashboard/today-at-facility/widget.ts` (`facilities.dashboard.todayAtFacility`, `dashboards.view` + `facilities.view`, `defaultEnabled`, refreshable) and `widget.client.tsx`: reads `GET /api/facilities/calendar` for the club-zone today without `placeId` through the existing `useStaffCalendar`; rows show `HH:MM–HH:MM`, the entry label (`entryLabel`) and the place, each linking to B-23 on its place and today; "Open calendar" opens the first entry's place and today (the calendar without parameters when nothing is scheduled); loading, empty ("Nothing scheduled", the mockup's `b.screenDashboard.nothingScheduled`), error with "Try again"; "and N more".
4. `placeCalendarHref(placeId, date?)` gains the optional day. Catalog keys `facilities.dashboard.todayAtFacility.title|description` (picked up by the platform's widget title lookup) and `facilities.dashboard.today.*` in `en` and `pl`.
5. TEST-R20 (`.ai/qa/tests/facilities/TEST-R20-today-at-facility-widget.spec.ts`, API and UI tests); TEST-N04 updated: the administrator, both coordinators and the attendant now have the widget, and "Nothing needs action today" is asserted for the account that holds only `dashboards.view`.
6. Spec: phase 16's deliverable line and a changelog entry.

## Decisions

- **No `setup.ts` placement.** The platform seeds a user's first layout from the `defaultEnabled` widgets in registry order (`dashboards/api/layout/route.ts`); the generated registry lists `today-at-facility` right after `requests-awaiting-approval`, so the widget stands beside it. `setup.ts` has no layout seam, and writing `dashboards` layout rows from `facilities` would be a cross-module write. A dashboard someone already saved keeps its widgets; the widget is added there with "Customize", as for every earlier Vereino widget (#95, #125, #310). The spec's deliverable line says so.
- **Which places count.** The spec says "bookable places"; the calendar without `placeId` lists every live active place with the entries on it. Filtering to leaves would hide a session or closure booked on a parent place, so the widget keeps every place except external ones (an away venue is not "at the facility"). Scope by role comes from the route itself (the attendant's grant narrows it), so the widget has no role logic.
- **All entry kinds.** Sessions, club bookings, rentals, requests, closures and maintenance windows all occupy the facility today; the mockup lists the day's occupancy without a kind filter.

## Files changed

`packages/app/src/modules/facilities/{lib/today-at-facility.ts,lib/__tests__/today-at-facility.test.ts,widgets/dashboard/today-at-facility/widget.ts,widgets/dashboard/today-at-facility/widget.client.tsx,components/facilities-client.ts,i18n/en.json,i18n/pl.json}`, `packages/app/.ai/qa/tests/facilities/TEST-R20-today-at-facility-widget.spec.ts`, `packages/app/.ai/qa/tests/club_core/TEST-N04-dashboard-menu-counts.spec.ts`, the spec and its changelog entry, this log.

## Commands and results

- `yarn workspace @vereino/app jest src/modules/facilities/lib/__tests__/today-at-facility.test.ts` — 4 passed.
- `yarn generate` — completed; the registry lists `facilities:today-at-facility:widget` after `facilities:requests-awaiting-approval:widget`.
- `yarn typecheck` — exit 0.
- `yarn spec-changelogs:check` — valid.
- `sg docker -c "yarn test:integration:vereino --filter TEST-R20"`: `TEST-R20 API` **passed** (21.9 s): the widget is on the dashboard of the administrator, the coordinator, the attendant and the second club's administrator, right after "Requests awaiting approval"; today's calendar holds the ten rentals for the administrator and the coordinator, Boisko A's four for the attendant, none for the second club. `TEST-R20 UI` failed before any step: `browserType.launch: Target page, context or browser has been closed … <process did exit: exitCode=127>` (the host lacks Chromium's `libatk-1.0.so.0`; lesson `cezar-host-integration-runs-without-browser`), so it runs only in CI.
- `sg docker -c "yarn test:integration:vereino --filter TEST-N04 --no-build"`: `TEST-N04 API` **passed** (7.2 s) with the new layouts; `TEST-N04 UI` failed only at the browser launch (`error while loading shared libraries: libatk-1.0.so.0`).
- `yarn verify` (after removing the gitignored `packages/app/.ai/qa/test-results` the local runs left): all 18 steps pass.

## Open problems / next steps

- AC-R16 stays unticked in the spec until CI's browser run of `TEST-R20 UI` (and the changed `TEST-N04 UI`) is green on the PR. Every phase of the spec has now landed; the spec moves to `implemented/` once its open acceptance criteria are confirmed.
- A dashboard saved before this change does not gain the widget by itself (platform behavior); the user adds it with "Customize".
