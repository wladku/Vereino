# Run: issue #276 — the facility calendar shows one place's whole day on the hour axis (E11-S02)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 276`, issue labelled `cezar`). Build phase 2 of the facilities
  parity spec: B-23 `/backend/facilities/calendar?place=&date=` around one `DayAxis` component.
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` phase 2 (REQ-R01, REQ-R03; TEST-R01
  axis part, TEST-R03; AC-R01); #276 (epic #253, depends on #275, merged); `feat/issue-276-facility-calendar-hour-axis`.
- **Approval:** the spec is `Ready for implementation` (owner decisions on #253, 2026-11-16). Phase 2 has no migration
  and no contract change (no route, schema or event changes; only UI, a pure lib and catalog keys).

## Steps

1. Claimed #276 (assignee, `in-progress`, claim comment).
2. Slice (a), pure layout: `facilities/lib/day-axis.ts` (axis bounds widened by whole hours, hours and geometry, lanes
   per overlap group, closed day, free open hours, day chips, bookable windows per weekday) with
   `lib/__tests__/day-axis.test.ts`.
3. Slice (b), components in `facilities/components/day-axis/`: `DayAxis.tsx` (legend, zone bands, blocks in lanes,
   free hours as buttons named `facilities.axis.bookFrom`, closed day, 40 px/hour, 48 px hour column, lanes ≥ 96 px
   with sideways scroll inside the axis), `DayEntries.tsx` ("Wpisy dnia" and the shared entry text), `DayChips.tsx`
   (chip rows with `aria-current`, seven day chips, "Other day", arrow keys, flagged counts).
4. Slice (c), the page: `FacilityCalendar.tsx` rewritten (place chips from `GET /api/facilities/options/places`, place
   and day in the address with `replace`, the seven chip days read in one calendar request, the availability card as
   `details`, per-entry actions, "Do przeniesienia", links to the zones and the place settings, states: axis
   skeleton, no places with "Add a place", no zone rules, closed day, error with retry, 403). `WeekZonePreview`
   lost its rental parts and stays on the zones tab. `PlaceForm` (B-06) links to the calendar and the zones.
   `facilities-client.ts`: `usePlaceRows`, `useCalendarFeatures`. Catalog keys `facilities.calendar.*`,
   `facilities.axis.*`, `club_core.places.links.*` in en and pl; eight unused calendar keys removed.
5. Tests: TEST-R03 (`packages/app/.ai/qa/tests/facilities/TEST-R03-day-axis.spec.ts`); E08-S01 and E08-S02 updated to
   the new calendar (folded card; the rental on the axis; "New rental" from a free hour).
6. Fixes found by the tests: maintenance used the `brand` Tag tone (axe `color-contrast` 2.11:1) → `pink` status tone
   in `KIND_TAGS` (the member timeline benefits too); lesson `tag-brand-variant-low-contrast` updated and promoted to
   an `AGENTS.md` Never rule because it recurred.
7. Spec changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-16-issue-276-phase-2.md`;
   the spec stays `Ready for implementation` (phases 3–16 open).

## Decisions

- Until the slot dialog (phase 3, E11-S03) a free hour opens the existing "New rental" dialog prefilled with the place,
  day and hour, and only for `facilities.rentals.manage`; without it the hours are not buttons.
- A free hour has no entry of the day on it (the filter never frees an hour), is inside an opening window, touches no
  closed zone, is not in the past (none on a past day; none before now today).
- The rental action links to the rentals list: the rental page `/backend/facilities/rentals/[id]` arrives in phase 5.
  The request action ("Decyzja") links to the requests page for `facilities.rentals.approve`; the closure action to the
  closures tab; maintenance opens the task dialog after reading the place's planned tasks (no new `id` filter, so no
  contract change).
- Lanes are counted per group of overlapping entries, so an entry alone keeps the full width.
- The availability card opens when the place has no bookable window and keeps the reader's choice afterwards (a save
  never folds it away). "Remove" shows only on days with set availability, the only rules it removes.
- A place named in the address but not bookable keeps a chip while shown; a place outside the scope shows the 403
  state from the calendar read.
- The flagged counts above the chips show while the filter is on and the day is one of the seven chips (only then the
  seven days are loaded).

## Commands and results

- `npx jest src/modules/facilities/lib/__tests__/day-axis.test.ts --coverage` — 16 passed, `day-axis.ts` 100 %.
- `yarn generate` — ok. `yarn typecheck` — 0 errors. `yarn typecheck:qa` — ok after one fix (`RentalCreated` has no
  `startsAt`; E08-S02 keeps the start it posted). `yarn format` — ok. `yarn qa-texts:check` — 0 problems.
- `npx eslint` on the changed files — first 3 errors (non-interactive tabindex on the scroll region, key handler on
  the chip group, a non-exhaustive switch), fixed; the scroll region's tabindex keeps the repo's documented
  `eslint-disable-next-line` for WCAG 2.1.1, as `packages/ui/src/admin/delivery-status-list.tsx` does.
- `yarn test:integration:vereino --filter TEST-R03` — run 1 failed at the arrow-key step: the build snapshotted the
  lint fix half-applied (handler removed from the group, not yet on the chips). Run 2 failed only on axe
  `color-contrast` (the `brand` maintenance tone, 2.11:1). Run 3 — 1 passed (3.2 min).
- `yarn test:integration:vereino --filter E08-S01` — 1 passed (2.1 min). `--filter E08-S02` — 1 passed (1.6 min).
- `yarn lessons:check` — valid.
- `yarn verify` — run 1 failed at `ds:check` (two arbitrary Tailwind values: the skeleton's `h-[560px]` → `h-96`,
  the chip row's `min-[480px]:flex-wrap` → `sm:flex-wrap`; the axis's three computed-geometry `style=` props recorded
  in `packages/app/.ds-check-ignore` as the DD-R01 exception). `--from ds:check` failed at `glossary:check`:
  `club_core.places.links.calendar` = "Kalendarz obiektu" uses the retired term "obiekt" in `club_core.places.*`;
  allow-listed in `scripts/check-glossary.allow.json` because the link names the B-23 page by its title.
  `--from glossary:check` — all 7 remaining steps passed. Final full `yarn verify` — all 17 steps passed.

## Open problems / next steps

- Phases 3–16 of the spec are separate issues; phase 3 replaces the "New rental" stand-in with the slot dialog, phase
  5 points "Open the rental" at the rental page.
