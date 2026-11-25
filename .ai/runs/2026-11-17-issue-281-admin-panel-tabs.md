# Run: issue #281 — E11-S07 an administrator works the zones, closures, price list, log, incidents and bans tabs and adds past records from the panel

- **Goal and trigger:** cezar task (`om-auto-fix-issue 281`, label `cezar`): build phase 7 of
  `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` (REQ-R09, REQ-R10; TEST-R11, TEST-R01 92-day rule; AC-R07).
- **Spec / issue / branch:** spec `Ready for implementation` (owner approval 2026-11-16 on #253, which also approves the
  issue's Ask First item: the past-start widening of `POST /api/facilities/internal-bookings` for the club
  administrator, with 422 `booking_too_old` — *Rollout*, row 5 of the Ask First table; Q-R13 confirmed). Dependencies
  #256 (E09-S02 tab shells) and #277 (E11-S03 slot dialog) closed. Branch `feat/issue-281-admin-panel-tabs`.

## Steps

1. Claimed #281 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and Ready, no open PR for the issue.
2. Slice (c), DD-R17: `lib/internal-bookings.ts` — `PAST_BOOKING_MAX_DAYS = 92`, `bookingInPast`,
   `earliestPastBookingDate`, `bookingStartProblem(startsAt, now, timeZone, clubAdmin)` (replaces
   `bookingStartAllowed`); the create command reads `hasKind(scope, 'club_admin')`, throws the problem's code on
   `startsAt`, keeps every occupancy check and returns before the supersession for a past start (so no
   `facilities.rental.superseded` event and no e-mail). New error code `booking_too_old` (422, en/pl message, OpenAPI).
   B-23: `freeOpenHours` takes `pastFrom` (new `hourInPast`); `DayAxis` passes it; `FacilityCalendar` sets it for the
   holder of `facilities.manage` with the general kind and opens a past hour's slot dialog with `['general']` only.
3. Slice (a), B-26: `ZonesTable` (column order of `screenZones`, "Set booking availability" primary with
   `AvailabilityDialog` and the save summary — `SaveSummary` moved from the calendar to `AvailabilityDialog.tsx` as
   `AvailabilitySaveSummary`), `ClosuresTable` ("When" via `periodLabel`, "Description"), `RatesTable`; the place cell
   is `PlaceCalendarLink` (`FacilitiesControls.tsx`) to `placeCalendarHref`. Polish "Dodaj stawkę", "Ustaw dostępność do
   rezerwacji" as the mockup.
4. Slice (b), B-27: `LogsTable` (Before / After columns, "Add entry") with the new `LogCreateDialog` (reuses the
   attendant's `TimeField`, `ConditionField`, `Problem`, `submitOnCtrlEnter`, now exported from `FacilityDialogs.tsx`;
   groups from the staff calendar of that place and day). `IncidentsTable` (mockup column order, the no-delete note as
   the description, "Report incident" = the attendant's `IncidentDialog` with the new `where` prop for place and day,
   the "Ban request" checkbox filter, a "ban issued" badge, the row action "Issue ban"). `BansTable` (Subject, From, To
   or "indefinitely", Reason, Issued by, then place, incident, state; `BanDialog` exported with `prefill`, the prefilled
   incident kept as an option). API: `GET /api/facilities/incidents?banRequest=open` (validator, route filter
   `openBanRequestFilter`) and the item field `banIssued` (`attachIncidentNames`), both through
   `services/ban-requests.ts` (`incidentsWithBan`, `openBanRequestIds`).
5. TEST-R11 (`.ai/qa/tests/facilities/TEST-R11-panel-tabs-and-past-records.spec.ts`) and the 92-day / past-hours unit
   tests; spec changelog entry `2026-11-17-issue-281-phase-7.md`; the spec stays `Ready for implementation`.

## Decisions

- **"Prośba o zakaz wstępu", not the mockup's "Wniosek o zakaz":** the navigation spec's glossary retires "wniosek" (the
  word belongs to online booking requests); #282 already uses "Poproś o zakaz wstępu". English "Entry ban request".
- **A revoked ban still closes the request:** the incident's request was answered by issuing a ban; "ban issued" stays.
- **Client gate for the past hours = `facilities.manage`:** only the club administrator role holds it
  (`@vereino/core` `roleCatalogue`: `facilities.*`); the server decides with the `club_admin` grant either way.
- **Past hours of today count too:** an hour that began before now is "past" for the dialog (general kind alone), the
  same rule the server applies (`startsAt <= now`).
- **Extra columns kept after the mockup's:** the bans tab keeps place, incident and state after "Issued by" and the
  incidents tab keeps the linked case, because a ban is per place and the Active/Revoked/All tabs need the state.
- **Unused catalog keys removed:** `facilities.records.logs.before|after`, `logs.columns.conditions`,
  `bans.period.range|permanent`, `bans.columns.period`.

## Commands and results

- Unit tests: `npx jest lib/__tests__/internal-bookings.test.ts day-axis.test.ts error-codes.test.ts` — 3 suites, 32
  tests passed; coverage of `lib/internal-bookings.ts` and `lib/day-axis.ts` 100 % lines, branches, functions.
- `yarn typecheck` run 1 — failed: `LogCreateDialog.tsx(93,51): error TS2783: 'headcount' is specified more than once`
  (and `supervisor`); fixed the draft merge. (The `.mercato/generated` errors in the same output were a fresh worktree
  before `yarn generate`.)
- `yarn glossary:check` — after renaming the filter to "Prośba o zakaz wstępu": 0 problems.
- `yarn test:integration:vereino --filter TEST-R11` (with an exported `AUTH_TOKEN_SECRET`) — 1 passed (2.6 min) on the
  first run.
- `yarn verify` run 1 — generate, typecheck, typecheck:packages, typecheck:qa passed; failed at lint:
  `TEST-R11-panel-tabs-and-past-records.spec.ts 73:13 error This assertion is unnecessary since it does not change the
  type of the expression @typescript-eslint/no-unnecessary-type-assertion`. Removed the cast and the unused import.
- `yarn verify --from lint` — lint, format:check, ds:check, i18n:check-hardcoded, contracts:check,
  settings-prefixes:check, glossary:check, qa-texts:check, lessons:check, spec-changelogs:check, test, test:scripts,
  build: all 13 passed.

## Open problems / next steps

- `openBanRequestIds` reads every incident of the organization that ever asked for a ban; fine at club scale, an index
  on `action_taken` would be the next step if it ever grows.
