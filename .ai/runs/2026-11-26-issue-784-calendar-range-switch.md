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

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared range rules and control

- [ ] 1.1 calendar-range.ts with TEST-W01
- [ ] 1.2 CalendarRangeSwitch with TEST-W02 and a story

### Phase 2: P-04 public facility calendar

- [ ] 2.1 Public schedule read from/to with TEST-W03
- [ ] 2.2 PublicScheduleView Day / Week / Month with TEST-W04

### Phase 3: M-03 member calendar

- [ ] 3.1 ClubCalendarPage on the shared control with TEST-W05

### Phase 4: B-23 and M-11 facility calendars

- [ ] 4.1 Week axes and month list components
- [ ] 4.2 FacilityCalendar and ClubPlacePage on the shared control with TEST-W06

### Phase 5: B-15 coordinator calendar

- [ ] 5.1 CoordinatorCalendar address state and shared control with TEST-W07

### Phase 6: Close-out

- [ ] 6.1 Older integration tests updated for the new defaults and testids
- [ ] 6.2 yarn verify and yarn guard green
- [ ] 6.3 Spec status and changelog, lessons
- [ ] 6.4 Review pass and PR summary

## Steps taken

(filled in as the run goes)

## Decisions

(filled in as the run goes)

## Files changed

(filled in at the end)

## Commands and results

(filled in as the run goes)

## Open problems / next steps

(filled in at the end)
