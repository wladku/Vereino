# Run: issue #278 — a coach or coordinator books a free hour of a place's day in one tap (E11-S04)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 278`, issue labelled `cezar`). Build phase 4 of the facilities
  parity spec: the member day page M-11 on the day axis, the slot dialog and an entry details sheet.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` phase 4 (REQ-R12; TEST-R12; AC-R08;
  J-R03); #278 (epic #253, depends on #277, merged); `feat/issue-278-one-tap-hour-booking`.
- **Approval:** the spec is `Ready for implementation` (owner decisions on #253, 2026-11-16). No migration, no
  dependency, no new module, no route or contract change; Q-R22 answered (coordinators see renters' names).

## Steps

1. Claimed #278 (assignee, `in-progress`, claim comment).
2. Slice (a), the page:
   - `club-places/ClubPlacePage.tsx` rebuilt: name, long date and capacity (`facilities.calendar.capacity.*`, now
     `capacityText` in `places-client.ts`), `DayChips` with "Other day" (the day stays in `?date=`), the hint
     `facilities.places.clickHint` (mockup `m.screenPlace.clickHintMember`), `DayAxis` and `DayEntries`; one tap on a
     free hour opens `SlotDialog` with the kinds of `useSlotKinds` (DD-R04). Loading skeleton, 403, error with retry,
     "no zone rules", the axis's closed-day line; "Plan maintenance" for a planner.
   - `club-places/EntryDetails.tsx`: the details sheet (kind, time, place, label; a session's group and coach; a
     rental's status and, only when the calendar returns it under DD-R18, the contact with a `tel:` link and "Open the
     rental"; "Cancel" for an own or cancellable booking, which closes the sheet and asks for the confirmation).
   - `DayAxis` gains `onEntry` (a pointer shortcut on the aria-hidden blocks) and `DayEntries` gains `onOpen` (the
     entry's text becomes a button — the keyboard path).
   - `slotPresetAt` in `slot/SlotDialog.tsx` builds the preset of a tapped hour for B-23 and M-11 alike.
   - `FacilitiesClubFrame` wraps the page in `ClubTimeZoneProvider`, so the slot dialog reads and writes club-zone wall
     times on `/club` (without it `useRentalTimeZone` fell back to the browser's zone).
   - Removed: `PlaceTimeline.tsx` (the tag maps moved to `day-axis/tags.ts`), `BookDialog.tsx`, the range box,
     `daySegments`, `isFreeSegment`, `shortWeekday`, `compactRange`, `DAY_START`/`DAY_END`, `EVENT_NAME_MAX` and 41
     catalog keys only they used (en, pl).
3. Slice (b), the tests: TEST-R12 (`TEST-R12-member-day-page.spec.ts`); E08-S03 follows the day axis.
4. Spec changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-17-issue-278-phase-4.md`;
   the spec stays `Ready for implementation`.

## Decisions

- The axis blocks stay `aria-hidden`; a tap on one opens the details for pointer users, and "Wpisy dnia" carries the
  same action as a real button, so no hidden element is focusable.
- The day page reads one day (as before), not the seven chip days of B-23: M-11 shows no per-day counts.
- "Cancel" in the sheet closes the sheet before the confirmation, so two dialogs never stack.

## Commands and results

- `yarn generate` — ok. `yarn typecheck` — 0 errors. `yarn typecheck:qa` — ok. `yarn eslint
  src/modules/facilities/components` — 0 errors (2 old warnings in `IncidentsTable.tsx`, untouched).
- `yarn test:integration:vereino --filter TEST-R12` — the first run was cut off by a cezar restart (no result); run 2 —
  1 passed (1.8 min).
- `--filter E08-S03` — 1 passed (39 s). `--filter TEST-R03` (regression for the shared axis) — 1 passed (1.3 min).
- `yarn verify` — run 1 failed at `ds:check`: `.ds-check-ignore [stale] src/modules/facilities/components/day-axis/DayAxis.tsx
  inline-style style=`. Cause: the checker reads an opening tag up to its first `>`, and the new block `onClick`
  (an arrow) stood before `style=`; moved `onClick` to the end of the tag (lesson
  `ds-check-opening-tag-ends-at-first-arrow`). `yarn verify --from ds:check` — passed. Final full `yarn verify` — all
  17 steps passed.
- The UI was checked by TEST-R12 in a real browser at 375 and 320 px, in Polish and English, light and dark (axe
  `scanInColorSchemes` without blocking violations), no console errors.

## Open problems / next steps

- Phases 6–9 and 11–16 of the spec are separate issues.
