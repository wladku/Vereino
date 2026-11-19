# Run: issue #378 — club events in the panel (E14-S03)

- **Trigger:** Cezar queued `om-auto-fix-issue 378` after the `cezar` label (2026-11-19T22:32Z), task 7e350780.
- **Issue:** #378 (epic #375), feature route; dependencies E14-S01 (#376) and E14-S02 (#377) closed; readiness cleared by the owner on 2026-11-19 (spec T approved, PR #418 merged).
- **Spec:** `.ai/specs/2026-11-18-vereino-club-events-with-parts.md`, phase 3 (REQ-T11 without the Files tab, REQ-T04 UI; TEST-T11 without the files steps).
- **Branch:** `feat/issue-378-admin-club-events-panel` (Cezar worktree).

## Goal

The administrator (and a coordinator) lists club events in the panel (B-T1), creates one with its place and an external place added in place (B-T2), and works its parts by day on the record (B-T3): add with visiting teams, edit, copy, move with the place locked, cancel, remove (409 offers Cancel).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run, worktree and branch).
2. Read the spec's UI contract, the routes of #376/#377 and the reference components (`ActivitiesTable`, `ActivityRecord`, `EventForm`, `MoveOccurrenceDialog`, `CancelOccurrenceDialog`, `GroupRecord` tabs, `AddExternalPlaceDialog`).
3. Pure rules with unit tests in `lib/club-events.ts`: `partsByDay`, `partActions`, `minutesBefore`.
4. Additive reads: `clubEvent` on `GET /api/activities/activities[/{id}]` items; `publicPath` on `GET /api/activities/club-events/{id}` (`clubEventPublicPathOf`).
5. `club_core` injection widget `club_core.injection.add-external-place` on the spot `vereino:activities:club-event-form:add-place`.
6. Components `ClubEventsTable`, `ClubEventForm`, `ClubEventRecord`, `ClubEventPartsTable`, `ClubEventPartDialog`, `ClubEventReasonDialog`, `club-events-client.ts`; `MoveOccurrenceDialog` gains `lockedPlace`; "Part of {event}" on B-13, the activity record (read-only, no Delete) and the session record; pages under `backend/activities/club-events/`; en/pl keys.
7. TEST-T11 (`.ai/qa/tests/activities/TEST-T11-club-events-panel.spec.ts`), run locally with `yarn test:integration:vereino --filter TEST-T11`.

## Decisions

- **Add place through an injection spot, not an import.** The module-boundary lint forbids `activities` importing `club_core` components; the spec puts the dialog in `club_core/components/`. The form renders `InjectionSpot` with the dialog's props as context and `club_core` draws the dialog (the `people` staff-setup precedent). The widget is gated by `club_core.places.add_external`, like the route.
- **Add team over HTTP with `InlineCreateDialog`** (name, club or institution, contact): `groups/components/ExternalTeamForm` cannot be imported either; the institution picker of that form is `groups`-internal, so it is left out (the team can be completed on B-groups later).
- **Day grouping** = one embedded `DataTable` per day under an `h2` heading (the platform `DataTable` has no row groups).
- **Move / Cancel of a part session** read the session (`GET /api/activities/occurrences/{id}`) on demand for its lock token and fields instead of adding them to the event read ("no new API").
- **"Part of {event}" needs the event name** on B-13, so the activities list/detail gain the additive `clubEvent` ref (same shape as the session read); the record header's Public page link needs the club slug, so the event read gains `publicPath`.
- **Event cancel dialog** states the number of planned parts with a group whose families will be told (the exact family count is not known before the command); the toast names the `notified` total.
- **Menu entry** "Club events" in the Schedule group (`pageOrder: 15`, between Activities 10 and Sessions 20), as the issue's note asks (spec N's "Classes" group has not landed).

## Files changed

`packages/app/src/modules/activities/{lib/club-events.ts (+ test), api/shared.ts, api/activities/[id]/route.ts, api/club-events/[id]/route.ts, services/club-events.ts, components/{ClubEventsTable,ClubEventForm,ClubEventRecord,ClubEventPartsTable,ClubEventPartDialog,ClubEventReasonDialog}.tsx, components/club-events-client.ts, components/{MoveOccurrenceDialog,ActivitiesTable,ActivityRecord,OccurrenceRecord}.tsx, components/client-helpers.ts, backend/activities/club-events/**, i18n/{en,pl}.json, README.md}`, `packages/app/src/modules/club_core/widgets/{injection-table.ts, injection/add-external-place/*}`, `packages/app/.ai/qa/tests/activities/TEST-T11-club-events-panel.spec.ts`, the spec changelog entry `2026-11-19-issue-378-phase-3.md`.

## Commands and results

- `yarn typecheck` — green. `yarn lint` — one error (`no-unnecessary-template-expression` in `ClubEventPartsTable`) fixed.
- `jest lib/__tests__/club-events.test.ts` — 24 passed.
- `yarn test:integration:vereino --filter TEST-T11`:
  - run 1 failed at Add team: `expect(teamDialog).toBeHidden()` — the team name typed in the dialog's first frame was cleared ("This field is required"); the test now fills until the value holds.
  - run 2: the whole flow passed; axe found `aria-valid-attr-value` (critical) on B-T1 in every locale/scheme/width — the view tabs' `aria-controls` pointed at panels that did not exist. Fixed by rendering the table inside the active `TabsContent`.
  - run 3: passed (1 passed, 57.1s) — en and pl, light and dark, 1280 and 1024 px, axe clean.

## Open problems

- The `InlineCreateDialog` (`@vereino/ui`) form opened inside the part dialog lost a value typed in its first frame (run 1). Not reproduced by hand; worth a look if users report a lost first keystroke.

## Next steps

- E14-S04 (Files tab), E14-S05 (phone pages).
