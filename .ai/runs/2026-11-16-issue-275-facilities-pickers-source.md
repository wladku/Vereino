# Run: issue #275 — facilities pickers and lists read places from the module's own source (E11-S01)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 275`, issue labelled `cezar`). Build phase 1 of the facilities
  parity spec: the attendant's place pickers are empty because they read `/api/club_core/options/places`.
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` phase 1 (parts of REQ-R01, REQ-R12,
  REQ-R13, REQ-R14; TEST-R02, TEST-R12 list part); #275 (epic #253); `feat/issue-275-facilities-pickers-source`.
- **Approval:** the issue asked to confirm the contract changes before building. The owner approved them on #253
  (comment 6910005145, Ask First items 3–5: the `club_core` DI additions, the `activities` contract, the `facilities`
  routes and additive fields); the spec is `Ready for implementation`.

## Steps

1. Claimed #275 (assignee, `in-progress`, claim comment); renamed the task branch.
2. Slice (a), DI: `clubCoreDirectory.placeOptions` gains `parentId`, `kind`, `surface`, `isExternal`,
   `acceptsOnlineRequests` (the `club_core` option route's schema lists them); `activities.placeSessions` →
   `PlaceSessionEntry` gains `groupName`, `sectionId` (through `groups.directory`) and `coachPersonId`.
3. Slice (b), routes: new `GET /api/facilities/options/places` (gate `facilities.view` or
   `facilities.maintenance.manage` in the handler; scope from `optionPlaceIds`); `GET /api/facilities/calendar`
   places gain the facts, entries gain `placeName`, `groupName`, `coachName`, `status`, `contact`, `canOpen`
   (contact and `canOpen` only on `rentalPlaceIds`, DD-R18; redaction sets all of them null);
   `GET /api/facilities/today` entries gain `placeName`, `groupName`, `coachName`, `contactName`, `contactPhone`, and
   `incidents` of the day on the place family.
4. Slice (c), UI: `usePlaceOptions`/`loadPlaceOptions` read the new route, `tolerantPlaceOptions` removed;
   `PlaceSelect` shows a failed read with a retry and an empty list as text; `/club/places` shows only bookable
   places (`isBookablePlace`) with "kind · surface · today: N entries / free" counted over the place family
   (`placeFamilyOf`) and the mockup's intro.
5. Pure helpers in `facilities/lib/place-scope.ts` with unit tests (100 %).
6. Integration test `packages/app/.ai/qa/tests/facilities/TEST-R02-place-and-calendar-reads.spec.ts`.

## Decisions

- "Today" returns incidents only to the log's readers (`facilities.log.write` + a log grant on the place): the incident
  readers are exactly the log's (`INCIDENT_REPORT_KINDS = LOG_KINDS`), so other `facilities.view` holders get `[]`.
- The rental scope of DD-R18 is the rental list's own: `facilities.rentals.manage` plus `club_admin` (every place) or
  the `facility_operator` places. Coordinators and coaches therefore see names without contact (Q-R22).
- An inactive place read by id on the calendar keeps the directory's facts and returns `kind: null`.
- The `/club/places` card follows the mockup line and no longer lists the first entries of the day.

## Commands and results

- `yarn generate` — ok. `yarn typecheck` — 0 errors. `yarn typecheck:qa` — ok. `yarn format` / `format:check` — ok.
- `yarn qa-texts:check` — 0 problems.
- `npx jest src/modules/facilities/lib/__tests__/place-scope.test.ts` — 11 passed, `place-scope.ts` 100 %.
- `yarn lint` — 0 errors (the only warning in a changed file, `today.ts:187`, is on an untouched line).
- `yarn test:integration:vereino --filter TEST-R02` — 1 passed (3.3 min), first run.
- `yarn verify` — all 17 steps passed.
- `yarn test:integration:vereino --filter E08-S03` (the `/club/places` card changed) — 1 passed (2.1 min).
- A first lint + integration run was killed by a cezar restart; both were re-run from the WIP commit.

## Open problems / next steps

- Phases 2–16 of the spec (the day axis, the slot dialog, the renter search, …) are separate issues.
