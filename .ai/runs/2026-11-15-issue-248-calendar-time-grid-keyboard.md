# Run: issue #248 — coordinator calendar time grid not keyboard-reachable; E06-S12 flakes late on Saturday

- **Goal and trigger:** unattended cezar run of `om-auto-fix-issue 248` (bug, priority-low), found while stabilizing CI on #247.
- **Issue:** https://github.com/wladku/Vereino/issues/248
- **Branch:** `fix/issue-248-calendar-time-grid-keyboard`
- **Spec:** none needed (bug fix, `direct`); club spec REQ-006 / E06-S12 (#94) owns the calendar perspective.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no open PR referencing #248 → claimed (assignee, `in-progress`, `🤖` comment).
2. Triage: the defect is real on `main`. `CoordinatorCalendar.tsx` is the only consumer of the installed `ScheduleView`; react-big-calendar renders `.rbc-time-content` (week/day hours) and `.rbc-agenda-content` as plain scrolling `div`s. With no timed event inside, axe `scrollable-region-focusable` fails, and keyboard users cannot scroll the hours (WCAG 2.1.1).
3. Root cause of the flake: `startNow` moves the session to "now −30 min … now +60 min"; from about 22:30 club time the window crosses midnight, react-big-calendar draws it in the all-day row, and the week has no timed event. Reproduced offline with `startNowWindows(Date.parse('2026-11-14T22:10:00Z'), false)` → `2026-11-14 22:40 .. 2026-11-15 00:10`.
4. Product fix (app side, not a baseline entry): `useFocusableScrollRegions` in `CoordinatorCalendar.tsx` gives each scroll region `tabindex="0"`, `role="region"` and a localized name, and re-applies them through a `MutationObserver` because the installed grid replaces the containers on view changes and mounts late (`next/dynamic`, `ssr: false`). A `:focus-visible` ring in `globals.css` next to the existing `.rbc-event` ring.
5. Test determinism: `startNowWindows(now, sameDay)` in `_fixtures/attendance.ts`; `startNow(…, { sameDay: true })` cuts each window to today's club-zone date (drops windows under 15 min). Opt-in, so the other callers keep their behaviour. E06-S12 uses it.
6. Regression oracle independent of the clock: E06-S12 now also opens the week before (always empty in this test), checks that the hours region is named, has `tabindex="0"` and takes focus, and runs the axe scan there.
7. Lesson `integration-tests-must-not-depend-on-the-clock` extended with the midnight shape and the `sameDay` rule.

## Decisions

- Fix in the app rather than adding `scrollable-region-focusable` to `PLATFORM_BASELINE`: the gap is real for keyboard users, and a baseline entry would also hide it on Vereino markup with the same class.
- DOM attributes on installed markup instead of ejecting `ScheduleView` (ejecting is Ask First); the hook only adds attributes React does not manage, so reconciliation leaves them alone.
- `sameDay` is opt-in: other specs (E03-S04, E06-S12 calendar-moved, E06-S13/14/16) rely on today's windows and are not reported flaky.

## Files changed

- `packages/app/src/modules/activities/components/CoordinatorCalendar.tsx`
- `packages/app/src/modules/activities/i18n/en.json`, `pl.json` (`activities.occurrences.calendar.scrollRegion`)
- `packages/app/src/app/globals.css`
- `packages/app/.ai/qa/tests/_fixtures/attendance.ts`
- `packages/app/.ai/qa/tests/activities/E06-S12-sessions-list-perspectives.spec.ts`
- `.ai/lessons/integration-tests-must-not-depend-on-the-clock.md`

## Commands and results

- `tsx` check of `startNowWindows` at 23:10, 00:05, 12:00 club time and the DST night → `sameDay` windows all inside one date; default reproduces the crossing.
- `yarn test:integration:vereino --filter E06-S12-sessions-list-perspectives` with the fix → `1 passed (1.7m)`.
- Negative control, same command with the hook call temporarily removed → fails on both attempts at the new check:
  `Error: expect(locator).toHaveAttribute(expected) failed … getByRole('region', { name: /^(Calendar hours, scrollable|Godziny kalendarza, przewijane)$/ }) … Error: element(s) not found`.
  One earlier negative attempt hung after `queue:worker --all` and hit the 40-minute background limit (its log file had been removed by a temp-dir cleanup); its orphaned server tree (pid 389412) was stopped and the run repeated.
- `yarn verify` → first run failed at `format:check` (`E06-S12-sessions-list-perspectives.spec.ts is not formatted`); formatted with prettier, `yarn verify --from format:check` → all 9 remaining steps passed; a final full `yarn verify` → all steps passed.

## Open problems / next steps

- None known beyond the PR review. UI verification in a browser is covered by the integration test (axe scan, focus, both locales accepted by the name pattern).
