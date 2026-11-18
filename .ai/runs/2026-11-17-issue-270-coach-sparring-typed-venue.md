# Run: issue #270 — a coach creates a sparring or an away match on the phone (E10-S05)

- **Trigger:** cezar run 09645cb3 (`om-auto-fix-issue 270`, label `cezar` added 2026-11-17).
- **Issue:** [#270](https://github.com/wladku/Vereino/issues/270) — feature, priority-high, risk-high.
- **Spec:** `.ai/specs/implemented/2026-11-14-vereino-parity-groups-and-activities.md`, phase 5 (REQ-A08; TEST-A11, TEST-A12; AC-A09; J-A02 steps 1 and 6). Status `Ready for implementation`; migration B, the `placeId` narrowing, the wider events input and the coach's edit right approved by the owner on #252 (2026-11-16, comment 6910004411).
- **Branch:** `feat/issue-270-coach-sparring-match-phone`.

## Steps

1. Triage: the spec is Ready and migration B is approved; the dependency E10-S04 (#269) is merged (`ebbf477d`); no open PR references #270. Feature route; claimed the issue (assignee, `in-progress`, claim comment).
2. Schema: entity changes with `@Check` decorators, migration B through offline `yarn db:generate` (snapshot diff = the two columns per table, two nullabilities, four named checks); `down` rewritten with `if exists` and the rollback query in its comment. Not applied anywhere.
3. Pure logic with unit tests (100 %): `lib/venue.ts` (`chooseLocation`, `storedVenue`, `venueLocation`, `awayByDefault`), `EVENT_TYPES` with `sparring`/`match` and `eventTypesForGroupKind`, `sessionConflicts` without a place (coach only), `member-event.ts` (venue mode, opponent, away, gathering time), the new `lib/session-edit.ts` (the edit page's draft, checks and PATCH body), `public-schedule.ts` / `public-events.ts` naming a venue.
4. Commands: `activities.events.create` (types, venue, opponent, away), `activities.activities.create|update` and the preview (`venue_requires_one_off`, `venue_or_place_required`), the series planner and the generator copy the venue, `activities.occurrences.update` (venue, coach right for a one-off event only, its undo authorized the same way), snapshots with the venue columns; `findConflicts` without a place checks only the coach and skips the occupancy provider.
5. Readers (V-A02; strict TypeScript flagged each): list mappers and schemas (`venue`, nullable `placeId`, the conflict list), the activity and session records, the calendar (`venue`, `mayEdit`; a venue fills `placeName`/`placeAddress`), `place-sessions.ts` (reads by place; a typed-venue session never appears), `public-schedule.ts`, `public-events.ts`, `substitutions.ts`. `communication` and `payments` read `activities.scheduleDirectory`, whose entries carry no place — nothing to change; `facilities` reads `activities.placeSessions`, which selects by place — nothing to change; the public session page and the share text render no place.
6. UI: `/club/events/new` (types per group kind, opponent, "Club place / Other address" with the help text, "away" ticked for another address, gathering), the panel `EventForm.tsx` (coach, opponent, location mode, away, gathering), the new `/club/occurrences/[id]/edit` (`ClubSessionEditPage.tsx`: date, start, end, place or other address, gathering, deadline, sticky submit bar, `ConflictList`), "Edit" on M-04 when `mayEdit`, the M-04 map link through `placeMapHref` (an OpenStreetMap search for a typed venue or a place without a pin), the panel move dialog keeps a typed venue unless a place is chosen.
7. Tests: TEST-A11 (API and security), TEST-A12 (phone, 375 px, en/pl, light/dark, axe).

## Decisions

- Deliverable 4 (the venue in the moved-session notice) is not built: phase 6 (#271) has not landed and the issue puts the edit notice out of scope. #271 renders the venue when it builds the notice.
- `PATCH /api/activities/occurrences/{id}` is gated by `activities.coach` instead of `activities.manage`: the coach lacks `manage`, and every role that edits a session (coach, coordinator, administrator) holds `activities.coach` in the role catalogue. The command decides by the grants. A custom role with `manage` but not `coach` would lose the route; none exists.
- A coach editing a session of a series answers 403 with a new code `coach_edit_series_session` (not the generic `scope_denied`), so the phone can say why.
- Cancelling stays as it was (#199): a coach of the group may cancel any of its sessions unless `coach_may_cancel` is off. The issue's "cancel one-off events" is already covered.
- A typed venue fills `placeName` and `placeAddress` in the reads, besides the explicit `venue`, so every existing card and record shows where the session is without a reader change.
- `activities.placeSessions` keeps its non-null `placeId` type: it selects by place, so a guard narrows the rows (the spec's "only the type changes").
- The phone form takes the gathering time as a wall time on the event's day; the API stays in minutes.

## Files changed

See the PR diff.

## Commands and results

- `yarn db:generate` (offline, snapshot-based) — `activities: generated Migration20261117110933_activities.ts`, every other module "no changes".
- `npx jest src/modules/activities/lib --coverage` — 20 suites, 245 tests passed; `venue.ts`, `session-edit.ts`, `member-event.ts`, `activities-rules.ts`, `public-schedule.ts`, `public-events.ts` at 100 %.
- `yarn typecheck`, `yarn typecheck:qa` — exit 0.
- `yarn contracts:check`, `glossary:check`, `qa-texts:check`, `spec-changelogs:check` — 0 problems.
- `yarn test:integration:vereino --filter TEST-A11` — first run: `[internal] yarn build failed` (`MoveOccurrenceDialog.tsx(38,3): error TS2344 … Type '"venue"' is not assignable to type 'keyof OccurrenceRow'` — the `venue` field had gone into `ActivityRow` only); after adding it to `OccurrenceRow`: 1 passed (1.8m).
- `yarn test:integration:vereino --filter TEST-A12` — 1 passed (2.2m).
- `yarn verify` — all 17 steps passed (`yarn test`: 93 suites, 1310 tests).

## Open problems

- Migration B is committed but not applied anywhere; the owner applies it after reading the SQL in the PR.

## Next steps

- Review and merge through the merge train; phase 6 (#271) adds the moved-session notice with the venue.
