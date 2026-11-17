# Run: issue #282 — E11-S08 a facility attendant takes and manages rentals and asks for an entry ban, all on the phone

- **Goal and trigger:** cezar task (`om-auto-fix-issue 282`, label `cezar`): build phase 8 of `.ai/specs/2026-11-14-vereino-parity-facilities.md` (REQ-R13, REQ-R14; TEST-R13, TEST-R14; AC-R09, AC-R10; J-R01, J-R08).
- **Spec / issue / branch:** spec `Ready for implementation` (owner approval 2026-11-16 on #253); issue #282; dependencies #277, #278, #279, #258, #259 closed; branch `feat/issue-282-facility-attendant-phone-rentals`.

## Steps

1. Claimed #282 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and Ready, no open PR for the issue.
2. Read the existing code: phases 1, 3 and 5 already ship every read this phase needs (`GET /api/facilities/today` with `placeName`, `groupName`, `coachName`, the contact under DD-R18 and today's incidents; `GET /api/facilities/renters`; `GET /api/facilities/rentals` with `id`, `view`, `from`, `to`; `RentalRecord`). No route, schema or migration change was needed.
3. Slice (a), Today rows (`ClubFacilityPage.tsx`, `facility-client.ts`): a session card reads "place / group · coach" ("club group" without a group), a rental card "Rental: {renter} · {place}" with "contact: {name}" and a `tel:` link; headcount fields only after the facility is opened (with a hint before); "No-show" on every rental that holds its slot, answering `noShow.tooEarly` before the start without an API call; "Incidents reported today" with "Add photo" (a retry for a failed upload); "no facility assigned" (no tabs) for a log holder without `facilities.manage` whose grant names no active place.
4. Slice (b), Rentals: tabs Today / Rentals in the address (`?tab=rentals`, only with `facilities.rentals.manage`); `ClubRentalsTab.tsx` (7 days back to 30 ahead, filter Active / To be moved / All in `?filter=`, "New rental" → `/club/places`, one card per rental, each a link); `/club/facility/rentals/[id]` (`ClubRentalPage.tsx`, `requireFeatures: facilities.rentals.manage`) on `RentalRecord variant="phone"`.
5. Slice (c), ban request: the incident dialog gains the rental picker (today's rentals; the renter's name goes into "people involved") and a separate "Request an entry ban" checkbox (`ActionChoices` takes `exclude`); `facilities.entry_ban_requested` notification type and e-mail template; `services/ban-requests.ts` (`notifyBanRequest`, key `facilities:ban-request:<incidentId>`) called by two persistent subscribers on `facilities.incident.created` and `.updated`.
6. Tests: TEST-R13 (phone UI journey) and TEST-R14 (API scope and the notice); the request probe gained an op `rental` that stores a `requested` phone rental at any time of today.
7. Spec: AC-R09 and AC-R10 ticked; changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-17-issue-282-phase-8.md`; status unchanged (other phases remain). Lesson `todays-rental-fixture-and-browser-clock`.

## Decisions

- **No backend read changes:** phases 1, 3 and 5 already return every field M-12 needs; the phone page reuses the panel's routes and adds no access (*Security*).
- **The in-app notice names no place:** dispatch in-app deliveries carry the notification type's generic keys only (DD-M07, `dispatch-worker.ts`), so the in-app title is "Entry ban request" / "Prośba o zakaz wstępu" and the e-mail subject carries "— {place}" (the AC's wording). Neither carries contact or description.
- **Sent once per incident:** the dispatch key `facilities:ban-request:<incidentId>` is the "newly set" guard — a later save or redelivery sends nothing; two persistent subscribers (created, updated) call one service.
- **The notice links to `/backend/facilities/incidents`:** the "requested" filter of the Incidents tab and "Issue ban" belong to E11-S07 (#281, open); that PR can add the filter parameter to this link.
- **Polish wording "Poproś / Prośba o zakaz wstępu":** `glossary:check` retires "wniosek" (the mockup's "Wnioskuj"); the catalogue already says "Poproszono o zakaz wstępu".
- **"No facility assigned" vs "the club has no facilities":** an empty place list shows the latter only to a holder of `facilities.manage`.
- **Phone `RentalRecord`:** no renter assignment (needs the people/institution register the attendant cannot read, DD-R06), no version history and no "Decide" (administrator's); a rental with a charge shows its charge state and no "Confirm payment" (DD-R09).
- **"New rental" opens `/club/places`:** a rental is taken on a place's day (J-R01).
- **Rental page axe scan uses `platformBaseline`:** the 5 `label` nodes are CrudForm 0.9.0 inputs (AGENTS.md), as on B-24's page in TEST-R07; the Today page scans stay strict.

## Files changed

`packages/app/src/modules/facilities/`: `components/club-facility/{ClubFacilityPage,ClubRentalsTab,ClubRentalPage,FacilityDialogs}.tsx`, `components/club-facility/facility-client.ts`, `components/RentalRecord.tsx`, `frontend/club/facility/rentals/[id]/{page.tsx,page.meta.ts}`, `services/{ban-requests,ban-request-subscriber}.ts`, `subscribers/incident-ban-request-{created,updated}.ts`, `emails/templates.ts`, `notifications.ts`, `di.ts`, `i18n/{en,pl}.json`; `packages/app/.ai/qa/tests/facilities/TEST-R1{3,4}-*.spec.ts`; `packages/app/.ai/qa/tests/_fixtures/facilities-request-probe/probe.mjs`; the spec, its changelog entry, this log, the lesson.

## Commands and results

- `yarn generate`: pass. `yarn typecheck`: first run `TS2322: Type '"info"' is not assignable to type 'AlertStatus'` (fixed: `information`), then pass. ESLint on the changed files: 0 problems. `yarn typecheck:qa`, `ds:check`, `i18n:check-hardcoded --strict`, `contracts:check`, `qa-texts:check`, `spec-changelogs:check`: pass. `glossary:check`: first run 6 problems (retired "wnios"), fixed, then pass.
- `yarn test:integration:vereino --filter TEST-R13` run 1: failed `scanInColorSchemes … '/club/facility/rentals/[id] (pl)'` → `{ id: 'label', impact: 'critical', nodes: 5 }` (CrudForm inputs; baseline added). Run 2: failed `expect(consoleErrors).toEqual([])` with `Failed to load resource: the server responded with a status of 422` — the deliberate invalid photo (excluded). Run 3: 1 passed (2.2m).
- `yarn test:integration:vereino --filter TEST-R14`: 1 passed (2.0m).
- `yarn verify`: all 17 steps passed.

## Open problems / next steps

- The Incidents tab's "requested" filter and "Issue ban" (E11-S07, #281) — the notice's link can then carry the filter.
- No screenshots attached by this run: the phone UI is proven by TEST-R13 (375 px, both locales, light and dark, axe); the PR carries `needs-qa` for a visual pass.
- Spec stays `Ready for implementation`; phases 6, 7, 9, 11–16 remain.
