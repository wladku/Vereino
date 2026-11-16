# Run: issue #276 — the facility calendar shows one place's whole day on the hour axis (E11-S02)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 276`, issue labelled `cezar`). Build phase 2 of the facilities
  parity spec: B-23 `/backend/facilities/calendar?place=&date=` around one `DayAxis` component.
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` phase 2 (REQ-R01, REQ-R03; TEST-R01
  axis part, TEST-R03; AC-R01); #276 (epic #253, depends on #275, merged); `feat/issue-276-facility-calendar-hour-axis`.
- **Approval:** the spec is `Ready for implementation` (owner decisions on #253, 2026-11-16). Phase 2 has no migration
  and no contract change.

## Steps

1. Claimed #276 (assignee, `in-progress`, claim comment).
2. Slice (a), pure layout: `facilities/lib/day-axis.ts` (axis bounds, hours and geometry, lanes, closed day, free open
   hours, day chips, bookable windows per weekday) with `lib/__tests__/day-axis.test.ts`.

## Decisions

## Commands and results

- `npx jest src/modules/facilities/lib/__tests__/day-axis.test.ts --coverage` — 16 passed, `day-axis.ts` 100 %.

## Open problems / next steps
