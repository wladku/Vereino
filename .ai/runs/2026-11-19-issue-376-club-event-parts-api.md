# Run — #376 E14-S01: club events and their parts through the API

- **Goal:** implement phase 1 of `.ai/specs/implemented/2026-11-18-vereino-club-events-with-parts.md` (REQ-T01, REQ-T02, REQ-T05 API, REQ-T07, REQ-T04 ids) and ship it as one PR.
- **Trigger:** Cezar run of `om-auto-fix-issue` on issue #376 (label `cezar`, 2026-11-19); feature route, spec `Ready for implementation`, owner approval Q-T20 recorded on the issue and in the spec.
- **Branch:** `feat/issue-376-club-event-parts-api`.

## Steps

1. Claimed #376 (assignee, `in-progress`, claim comment naming the worktree and branch).
2. Read the spec (phase 1), the activities commands, services and routes the phase touches.
3. Entities `ClubEvent`, `ClubEventPart`, `Activity.clubEventId`; pure rules `lib/club-events.ts` with unit tests (100 %); migration T1 from `yarn db:generate` (offline, from the snapshot), `down()` completed by hand.
4. Extracted the single-event write of `activities.events.create` into `commands/one-off-event.ts` (`writeOneOffEvent`, with a `coachOnly` switch for DD-T07) and reused it for parts.
5. Commands `activities.club_events.create|update|cancel` (`commands/club-events.ts`) and `activities.club_event_parts.create|update|delete|cancel` (`commands/club-event-parts.ts`), each undoable and audited; routes under `/api/activities/club-events*` with `metadata` and `openApi`.
6. Guards: `activities.activities.update|delete` answer 409 `activity_is_club_event_part`; `activities.occurrences.update|cancel` answer 403 `club_event_part_managed_by_event` and 422 `club_event_part_place_fixed`; a part session at an external place is checked for its coach only. `mayEditSession`, `cancelRolesOf` and `sessionActionFlags` share the rule, so the reads promise what the commands accept.
7. Reads: `clubEvent` on the calendar and session reads, `clubEventId` on the activities list and record, `isExternal` on the event options; `groups` external-team directory gains `clubName` (additive).
8. Integration tests TEST-T01 (+ TEST-T16), TEST-T02 (+ the API half of TEST-T03), TEST-T04, TEST-T05, TEST-T06.

## Decisions

- One shared session writer for single events and parts instead of a second copy (the issue asked for it), so opening hours, the schedule lock and the conflict check stay one code path.
- The part guard lives in `mayEditSession` / `cancelRolesOf`, not only in the commands, so the member and backend reads set `mayEdit` / `mayCancel` from the same rule.
- A place change of the event writes the moved sessions first and then checks each against the others at the new place, collecting every collision; the transaction rolls back on any.
- A coordinator of another section is refused by the session's own scope check (403 `scope_denied`); `club_event_part_managed_by_event` is reached by a coach of the group and by a coordinator of the group's section on a whole-club event.
- `ageCategoryLabel` of the options route is null until phase 3 (no age-category read exists in the directory contracts yet); `clubEvent.publicPath` checks the event and the club page publication, the `events` block check joins with the public page in phase 6.
- The coach role holds no `activities.view`, so the club event list and record answer a coach 403 (spec: a coach reads no club event).

## Files changed

- `packages/app/src/modules/activities/`: `data/entities.ts`, `data/validators.ts`, `data/queries.ts`, `migrations/Migration20261119190631_activities.ts` + snapshot, `lib/club-events.ts` (+ test), `lib/member-event.ts` (+ test), `lib/error-codes.ts`, `i18n/en.json`, `i18n/pl.json`, `commands/{one-off-event,club-events,club-event-parts,events,activities,occurrences}.ts`, `services/{club-event-scope,club-events,calendar,directory}.ts`, `api/club-event-shared.ts`, `api/club-events/**`, `api/{shared,activities/route,activities/[id]/route,occurrences/[id]/route,events/options/route}.ts`.
- `packages/app/src/modules/groups/services/group-directory.ts` (external team `clubName`).
- `packages/app/.ai/qa/tests/_fixtures/club-events.ts`, `packages/app/.ai/qa/tests/activities/TEST-T0{1,2,4,5,6}-*.spec.ts`.
- Spec status and changelog entry.

## Commands and results

- `yarn generate`, `yarn typecheck`: pass.
- `npx jest src/modules/activities/lib`: 25 suites, 313 tests pass; `club-events.ts` 100 % lines, branches, functions.
- `yarn db:generate`: `activities: generated Migration20261119190631_activities.ts`, other modules no changes.
- First integration runs: TEST-T01 failed at `expect(coachList.status).toBe(200)` (`{"error":"Forbidden","requiredFeatures":["activities.view"]}`) — the coach role has no `activities.view`; the test now expects 403. TEST-T02 failed at the declaration (`Expected: 200, Received: 201`) — the declare route answers 201 on a new declaration; the test now expects 201.

- `yarn verify` (first full run) failed at `lint`: 13 errors — `@mikro-orm/*` imported in three route files (REQ-F16 boundary), unnecessary assertions, a spread of a class instance, template literals with non-strings. Fixed by moving the reads into `services/club-events.ts` (`findClubEvent`, `pastClubEvents`, `sessionClubEvent`) and small edits; `yarn verify --from lint` then passed.
- Final `yarn verify`: all 18 steps passed.
- `yarn test:integration:vereino --filter TEST-T01|TEST-T02|TEST-T04|TEST-T05|TEST-T06`: each `1 passed` (T01, T02, T04 rerun after the route refactor: `1 passed`).

## Open problems

- None blocking. `ageCategoryLabel` of the options route stays null until phase 3; the `events` block check of `publicPath` joins phase 6.

## Next steps

- Phase 2 (external place from the form, #E14-S02) and phase 3 (panel) build on these routes.
