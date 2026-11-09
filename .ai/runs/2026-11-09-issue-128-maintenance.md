# Run log — #128 E08-S08 maintenance tasks, maintainers and the redacted calendar

- **Date:** 2026-11-09
- **Trigger:** cezar task `om-auto-fix-issue 128` (unattended), after the owner decision of 2026-11-09 on #128 (the spec's UI table stands in for a mockup) and the E08 approvals of 2026-11-05 on #119 (the `facilities` migration of each phase, the derived role `vereino_maintenance_planner`).
- **Spec:** `.ai/specs/2026-10-27-vereino-facilities.md` phase 5 step 9 (REQ-022, DD-36, DD-46; TEST-031, TEST-049, TEST-050).
- **Issue / branch:** #128 / `feat/issue-128-maintenance-tasks`.
- **Route:** feature (label `feature`), spec found → implemented directly on one implementation PR (the spec already covers the work; no spec PR).

## Goal

Planned maintenance blocks the facility calendar like a closure (409 `maintenance_scheduled`, existing entries flagged to be moved), reminders by date and by hours of use, completion, place maintainers who get the derived role, and a redacted calendar for a maintainer who holds only `facilities.maintenance.manage`.

## Steps

1. Claimed #128 (assignee, `in-progress`, claim comment); renamed the task branch.
2. `@vereino/core`: `maintenance_planner` derived role (feature `facilities.maintenance.manage` only) and `desiredRoles({ maintenancePlanner })`; `maintenance_planner` grant kind matching `placeId`; unit tests at 100 %.
3. `people`: the optional DI contract `facilities.maintainerScopeProvider` (`services/maintainer-scope.ts`, `hasRegistration`, absent → fail closed), read by `loadPersonScope` (the grant) and `desiredRolesForPerson` (the role).
4. `facilities` backend: entities and migration (`yarn db:generate` against an unreachable database, reviewed, `down()` added); `lib/maintenance.ts` (schedule validation, RRULE subset, next due date, reminder stage, the hours union) with tests; commands `facilities.maintenance.create|update|complete|send_reminders` and `facilities.place_maintainers.create|delete`; the occupancy kind `maintenance` through the occupancy service and provider, the rental slot check, internal bookings and the public request; the closure flagging extracted to `services/reschedule.ts` and shared; reminders through `dispatch` (in-app, DD-46 keys) with the daily schedule, worker and CLI; the redacted calendar; the public `unavailable` state.
5. UI (subagent, disjoint files): `/backend/facilities/maintenance` with the Maintainers tab, "Plan maintenance" and the redacted view on `/club/places`, the `unavailable` legend, en/pl catalogs.
6. Integration tests TEST-031, TEST-049, TEST-050 and fixtures `_fixtures/maintenance.ts`.

## Decisions

- **Recurring completion creates a new instance for both schedules.** The spec says a usage task "resets `usage_counted_from`"; resetting in place would need the task to stay `planned` after completion, against the forward-only `planned → done` table (DD-46). A new instance counting from `done_at` resets the counter and keeps each completion as history.
- **Task commands are not undoable**, like rentals: cancelling is a status, done tasks are never deleted, and the flags a window set stay for the coordinator (as for a closure).
- **Place maintainers are hard-deleted**: the unique key (organization, place, person) must allow a later re-assignment, and an assignment has no history beyond the audit log.
- **Reminders go in-app only** to the place's maintainers and the club administrators; the platform's notification rows carry generic keys only (DD-M07), so the in-app text is generic and links to the maintenance page.
- **A maintenance window is not limited by the opening hours** (glossary: "any time of day, also outside opening hours") and is allowed over existing entries, which it flags.
- **`/club/places` pages require sign-in only**: the page metadata cannot express "`facilities.view` or `facilities.maintenance.manage`", so the calendar API decides and the page shows its 403 state.
- **Reschedule notifications** (coordinator, booker, renter e-mail) are not sent for maintenance windows, exactly as for closures today; recorded as a follow-up for both.

## Files changed

See the PR diff; main areas: `packages/core/src/{roles,scope}.ts`, `packages/app/src/modules/people/{lib/people-rules.ts,services/{maintainer-scope,role-sync,scope-service}.ts}`, `packages/app/src/modules/activities/services/place-sessions.ts`, `packages/app/src/modules/facilities/**`, `packages/app/.ai/qa/tests/{_fixtures/maintenance.ts,facilities/TEST-031*,TEST-049*,TEST-050*}`, the spec and its changelog file.

## Commands and results

- `yarn workspace @vereino/core test` — pass, 100 % coverage.
- `yarn db:generate` — `facilities: generated Migration20261109202809_facilities.ts`; no other module changed.
- `yarn generate`, `yarn typecheck` — green.
- `yarn test` — 74 suites, 932 tests passed; coverage thresholds met.
- UI subagent: `yarn generate`, `yarn typecheck`, `yarn i18n:check-hardcoded --strict`, `yarn ds:check` passed; `yarn lint` reported 4 errors in the backend slice (an `@mikro-orm` type import in `api/maintenance-records.ts`, `no-misused-spread` in `commands/maintenance.ts`, two `restrict-template-expressions`), fixed by the coordinator (the list's counted hours now come from `usageHoursOfPlace` in the service).
- `yarn test:integration:vereino --filter TEST-049` — 1 passed (1.9 min).
- `yarn test:integration:vereino --filter TEST-050` — 1 passed (1.8 min).
- `yarn test:integration:vereino --filter TEST-031` — 1 passed (2.4 min).
- `yarn verify` — all 14 steps passed (generate … build).
- Regression: `--filter E08-S03` (the `/club/places` pages) — 1 passed; `--filter TEST-027` (closure flagging, now shared) — 3 passed.

## Not verified

- No browser walk of the new pages at 375 px or in both locales by the coordinator; the UI is covered by the type, lint, design-system and hardcoded-string checks and by `E08-S03` for the changed `/club/places` pages.

## Open problems / follow-ups

- Reschedule notifications for closures and maintenance windows (both only flag today).
- Existing deployments need the new `auth` role `vereino_maintenance_planner` seeded (`yarn mercato auth sync-role-acls` / the role seed) before the first maintainer is assigned; new clubs get it from `seedRoles`.
