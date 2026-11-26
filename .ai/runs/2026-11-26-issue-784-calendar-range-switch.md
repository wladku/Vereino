# Run: issue #784 — Day / Week / Month range switch on calendar views

- **Goal and trigger:** cezar task (`om-auto-fix-issue 784`, feature route → `om-auto-implement-spec`). Implement the
  spec `.ai/specs/2026-11-25-vereino-calendar-range-switch.md` (spec PR #785, merged) on one implementation PR.
- **Source doc:** `.ai/specs/2026-11-25-vereino-calendar-range-switch.md`
- **Issue:** #784 · **Branch:** `feat/issue-784-day-week-month-range-switch`
- **Engine:** om-auto-create-pr (steps: 12, --loop: no)

## Goal

Every calendar a person browses — P-04, M-03, B-23 / M-11 and B-15 — offers one shared Day / Week / Month switch with
the view and the date in the address; a phone opens on Day, a wider screen on Week; P-04's public read takes an
additive `from`/`to`.

## Scope

- `packages/ui`: `calendar-range.ts` (pure range rules) and `calendar-range-switch.tsx` (the control), unit tests,
  a Storybook story.
- `facilities`: public schedule read `from`/`to` (+ 400 `public_schedule_range_invalid`), `PublicScheduleView.tsx`,
  `FacilityCalendar.tsx`, `ClubPlacePage.tsx`, a week/month component next to `DayAxis`.
- `activities`: `ClubCalendarPage.tsx` (M-03), `CoordinatorCalendar.tsx` (B-15).
- i18n catalogs (en, pl) of both modules; integration tests TEST-W03…W07 and older tests whose testids/defaults move.

## Non-goals

B-26 zone week preview; dashboard tiles; new data, filters or permissions; a year view; the mockup (already updated by
#785).

## Risks

- Defaults change (desktop opens on Week): older integration tests that open the views without `range` must name it.
- B-15's grid (react-big-calendar) starts the week on the locale's first day (Sunday in English); the read covers both.

## Progress

PR: #796

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared range rules and control

- [x] 1.1 calendar-range.ts with TEST-W01 — 706fedb1
- [x] 1.2 CalendarRangeSwitch with TEST-W02 and a story — 706fedb1

### Phase 2: P-04 public facility calendar

- [x] 2.1 Public schedule read from/to with TEST-W03 — db038340
- [x] 2.2 PublicScheduleView Day / Week / Month with TEST-W04 — db038340

### Phase 3: M-03 member calendar

- [x] 3.1 ClubCalendarPage on the shared control with TEST-W05 — b22735b5

### Phase 4: B-23 and M-11 facility calendars

- [x] 4.1 Week axes and month list components — e80751ac
- [x] 4.2 FacilityCalendar and ClubPlacePage on the shared control with TEST-W06 — e80751ac

### Phase 5: B-15 coordinator calendar

- [x] 5.1 CoordinatorCalendar address state and shared control with TEST-W07 — e6e20599

### Phase 6: Close-out

- [x] 6.1 Older integration tests updated for the new defaults and testids — cfeb8949
- [x] 6.2 yarn verify and yarn guard green — d2f4f7f1
- [x] 6.3 Spec status and changelog, lessons — 707cb53f
- [x] 6.4 Review pass and PR summary — d2f4f7f1

## Steps taken

1. Claimed #784 (assignee, `in-progress`, 🤖 comment naming this worktree and branch); committed this plan and opened
   draft PR #796.
2. Phase 1 — `@vereino/ui`: `calendar-range.ts` (view and anchor of the address, Monday weeks, calendar months, moves,
   readable window, headings, `calendarRangeLabels`, media-query store) and `CalendarRangeSwitch` + `useWideCalendar`;
   TEST-W01/W02 as `node --test` suites at 100 % coverage; a Storybook story.
3. Phase 2 — P-04: `scheduleRange` (`from`/`to`, ≤ 31 days, readable window, `month` wins, 400
   `public_schedule_range_invalid`), the route and OpenAPI; `lib/public-range.ts` (defaults, old `?month=` links, a
   day or week reads its whole week); `PublicScheduleView` on the switch with Day, Week (list / seven cells) and Month.
4. Phase 3 — M-03: `member-calendar.ts` rewritten on the shared rules (view, anchor, link range in the address);
   `ClubCalendarPage` on the switch with Upcoming before Day / Week / Month; empty Day offers "Next day".
5. Phase 4 — B-23 and M-11: `DayAxis` takes shared `bounds` and `legend`; `RangeDays.tsx` (`WeekAxes` from `lg`,
   `RangeEntryList`); `FacilityCalendar` and `ClubPlacePage` on the switch; the staff calendar cap admits the DST hour.
6. Phase 5 — B-15: `coordinator-calendar.ts`; `CoordinatorCalendar` renders the installed `ScheduleCalendar` without
   its toolbar, driven by the switch and the address (view, day, section).
7. Older integration tests updated for the new defaults and testids: TEST-028, TEST-R16, E06-S18, ISSUE-493, the
   `showCalendarWeekOf` fixture, TEST-R03, TEST-R04, TEST-R07, TEST-R11, TEST-R19, E08-S02, E20-S13, E06-S12.
8. Spec moved to `implemented/` with a changelog entry; lesson `a-cap-of-n-days-counts-club-days-not-24-hour-blocks`.

## Decisions

- One run, one PR for all five phases: the issue is one story and the phases share the switch, the catalogs and the
  older tests; children in parallel worktrees would have edited the same i18n files.
- Switch texts live in each module's catalog under `<module>.rangeSwitch.*` with identical words, mapped by
  `calendarRangeLabels(t, prefix)`; importing `@/modules/foundation` into client pages would pull server code.
- Links, not buttons, for the switch (spec UI contract): view change pushes, arrows replace. Old tests that asserted
  `aria-checked` on the M-03 SegmentedControl now assert `aria-current="page"`.
- P-04 reads a day's whole week (DD-W03), so stepping through a week's days and the phone's switch from Week to Day
  after hydration read nothing new.
- B-23 / M-11 arrows have no `min`: "Other day" already reaches any date; restricting would be a regression.
- `calendarWindowProblem` allows 31 days + 1 hour (October), rather than the client trimming the month's last hour.
- B-15 renders `@open-mercato/ui/backend/schedule/ScheduleCalendar` (public through the package's `./*` export)
  instead of `ScheduleView`, so its toolbar disappears instead of being kept in sync (A-W03 fallback not needed).
  The grid's English week starts on Sunday; the read covers Sunday to Sunday so both locales show their sessions.
- The week fixtures (`showCalendarWeekOf`, E06-S18 `showMonthOf`) now start from the address's `date`, since a reload
  keeps the view.
- Review (independent subagent on the diff) found three bugs, all fixed in `d2f4f7f1`: B-15's grid started English
  weeks on Sunday (now Monday in every language through the platform's exported `scheduleLocales` registry, DD-W04;
  the read is the grid's dates); the grid's own drill-down pushed several wrong ranges (now a no-op, the switch is the
  only navigation); P-04 computed its window from the browser's date, which could ask the club-zone server for a
  day outside its window (now `publicSafeWindow`, a day inside on both ends).
- The week columns' day links carry the long date as screen-reader text after the visible text (axe
  `label-content-name-mismatch` on an `aria-label`).

## Files changed

- `packages/ui/src/member/calendar-range.ts`, `calendar-range-switch.tsx`, `index.ts`, their tests, a story and its
  catalogs.
- `facilities`: `lib/public-schedule.ts`, `lib/public-range.ts`, `lib/public-load.ts`, `lib/error-codes.ts`,
  `lib/day-axis.ts`, `lib/internal-bookings.ts` (+ tests); `api/public-shared.ts`, the public schedule route;
  `services/public-schedule.ts`; `components/public/PublicScheduleView.tsx`, `public-client.ts`;
  `components/FacilityCalendar.tsx`, `club-places/ClubPlacePage.tsx`, `day-axis/DayAxis.tsx`, `DayEntries.tsx`,
  `RangeDays.tsx`; `i18n/en.json`, `pl.json`.
- `activities`: `lib/member-calendar.ts`, `lib/coordinator-calendar.ts`, `lib/occurrence-list.ts` (+ tests);
  `components/club/ClubCalendarPage.tsx`, `components/CoordinatorCalendar.tsx`; `i18n/en.json`, `pl.json`.
- Integration tests: new TEST-W03…W07; updated TEST-028, TEST-R16, E06-S18, ISSUE-493, TEST-A19, E06-S12, TEST-R03,
  TEST-R04, TEST-R07, TEST-R11, TEST-R19, E08-S02, E20-S13, `_fixtures/activities.ts`, `_fixtures/public-places.ts`.
- `.ai/specs/implemented/2026-11-25-vereino-calendar-range-switch.md` (moved, status), its changelog entry, D-040
  path; lesson `a-cap-of-n-days-counts-club-days-not-24-hour-blocks`; this log.

## Commands and results

- `packages/ui` `yarn test` — 286 passed, 100 % lines/branches/functions; app jest on the changed `lib` folders —
  all passed, 100 % on every changed lib file.
- `yarn test:integration:vereino --filter <id>` (one id per run, first with a build, then `--no-build`):
  TEST-W03, TEST-W04, TEST-W05, TEST-W06, TEST-W07 passed. Older: TEST-028, TEST-R16, TEST-039, TEST-N09, E06-S18,
  ISSUE-493, E06-S12, TEST-R03, TEST-R04, TEST-R07, TEST-R11, TEST-R19, E08-S02, E20-S13, TEST-R12, TEST-R18, E08-S03,
  TEST-R13, TEST-R15, E08-S01, E03-S04, ISSUE-140, TEST-489, TEST-A16, J-002, E06-S19, E09-S05, TEST-R20, TEST-A19,
  TEST-014, E20-S12, E09-S04, E06-S14 passed.
- Failures on the way, fixed: TEST-W06 `getByRole('heading')` strict mode (2 headings); axe
  `label-content-name-mismatch` on the week day links (7 nodes); a URL regex assuming parameter order; ISSUE-493 and
  TEST-A19 expected the upcoming list as the phone default; TEST-W07 on the pre-fix build: `Expected: "2026-11-30"
  Received: "2026-11-29"` (Sunday-first English grid), green after the fix and a rebuild.
- `yarn verify` — first run failed at lint (React Compiler "Existing memoization could not be preserved" on two
  manual memos, `restrict-template-expressions`, `no-unnecessary-type-assertion`, `no-confusing-void-expression`), then
  ds:check (inline style, then an arbitrary Tailwind value), glossary:check ("zajęć" → "terminów"), qa-texts:check (a
  literal weekday regex); after the fixes all 23 steps passed, twice (last after the review fixes).
- `yarn guard` — no blocking findings.

## Open problems / next steps

- B-15's Monday week is set by replacing entries of the platform's exported `scheduleLocales` registry at module load;
  it affects every installed schedule grid in this app (all of which should follow DD-W04). If the platform later
  exposes a week-start option, use it instead.
- QA in the browser on the sandbox (light/dark, 375 px) by the owner after merge; `needs-qa` is set.
