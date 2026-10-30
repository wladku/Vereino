# Issue #31 — activities, sessions, conflicts, one-off events and cancellation (club spec phase 2 steps 3 and 8)

- **Date:** 2026-10-29
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (installed from `open-mercato/skills`, repo-local override applied; feature route) with one implementation subagent (which used a page subagent and a test subagent) and the coordinator's own review and gate
- **Trigger:** product owner — "/om-auto-fix-issue 22"; #22 is the E03 epic, the owner chose #31 and approved the new module, its migrations and the `date-fns` / `date-fns-tz` declaration in `@vereino/core` ("Moduł + migracje + deps w core")
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 steps 3 and 8 (and the dependency half of step 1), foundation II `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` P-24, P-25, P-26 (TEST-007, TEST-012, TEST-034); issue #31 (epic #22); branch `feat/issue-31-activities`
- **Status:** completed — PR open for review

## Goal

A coordinator plans a weekly series for a group and sees its sessions for 16 weeks; a moved session leaves the series; no place or coach is double-booked; a coach adds a tournament for their own group; a cancelled session notifies the people it concerns.

## Steps

1. Read #22 and its open stories; #30 (#54) had merged, so #31 starts from `main` (9d13d46). Owner chose #31 and approved the module, migrations and the core dependencies; `dictionaries`, `rrule` and any other package or module were not approved.
2. Claimed #31 (assignee, `in-progress`, 🤖 comment naming the A05 exclusions); worktree from `main`.
3. Subagent: FR triage (none of the scheduling primitives existed; P-12, the scope primitives, `scheduler`, `notifications`, the leaf-place rule and the coach grant were reused), then the foundation II primitives in `@vereino/core`, the `foundation` wrappers, additive directory services in `club_core`, `groups` and `people`, the `activities` module, its pages and integration tests.
4. Coordinator review: dependency diff limited to two lines of `yarn.lock` and no new package; migration creates only new tables, hand-written `down()`; every command goes through `authorizeScoped`, every detail read through `assertInScope` with the list's kinds; the schedule writes take the per-club advisory lock; `yarn verify` and the full integration suite rerun by the coordinator.

## Decisions

- Horizon: today to today + 16 weeks, never in the past, capped by `ends_on` and the rule's `UNTIL`; a rule with no session gets 422 `activity_no_sessions`; a series starting beyond the horizon is filled later.
- Generator: the daily job `activities:generate-occurrences` (03:00 club time, registered through `registerModuleSchedule` from `seedDefaults`, re-registered on `club_core.settings.updated`) runs a non-undoable command allowed only to the `system_job` grant; a slot that already had a session is never refilled; the partial unique slot index makes a retry a no-op; a conflicting new session is created with `needs_reschedule = true`.
- Conflicts: the preview lists every conflict and never answers 409; every save is refused on a conflict — 409 `occurrence_place_conflict` (planned sessions on the place, its ancestors and descendants against `capacity_groups` at peak concurrent use, half-open) or the new 409 `occurrence_coach_conflict` (a coach leads one session at a time). No "save anyway". A failing occupancy provider fails a save closed and only warns in the preview.
- Cancellation (the in-app half of step 6): undoable, reason required, notifies participants with an account, the guardians of participants not known to be 18 on the session date, the session's and the group's coaches, never the canceller; grouped by session so a retry refreshes it.
- One-off events: `tournament` and `other` only; `sparring` on a class group answers 422 `activity_type_requires_team` (TEST-034); a group the coach does not coach 403.
- A moved session keeps its slot date; cancelled and done sessions are pinned; deleting an activity with past, cancelled or done sessions is 409 `activity_has_sessions` (deactivate instead).
- The coordinator role gains `activities.view` next to `activities.manage`, because ACL `dependsOn` is not expanded.

## Installed behaviour that differed from the spec

- `date-fns-tz` 3.2 `getTimezoneOffset` and `fromZonedTime` are wrong around the DST shifts, so `zonedInstant` reads offsets through `formatInTimeZone` and applies RFC 5545 §3.3.5 itself.
- MikroORM `type: 'uuid[]'` generates `text[]`; `columnType: 'uuid[]'` gives the spec's column.
- The ESLint boundary allows `@mikro-orm/*` only in `data`, `commands`, `services`, `setup` and `di`, so the preview, the cancellation notice and the place options read live in services.

## Files changed

- `packages/core/{package.json,src/recurrence.ts,src/interval.ts,src/transitions.ts,src/index.ts,src/roles.ts,src/__tests__/*}` and `yarn.lock` — P-24, P-25, P-26, coordinator `activities.view`
- `packages/app/src/modules/foundation/{services/recurrence.ts,services/transitions.ts,services/occupancy.ts,lib/error-codes.ts,i18n,index.ts,di.ts,README.md}` — wrappers and error codes
- `packages/app/src/modules/club_core/{lib/places.ts,services/directory.ts,api/options/places,di.ts,README.md}`, `groups/{services/group-directory.ts,di.ts,README.md}`, `people/{services/person-directory.ts,di.ts,README.md}` — additive directory reads
- `packages/app/src/modules/activities/**`, `packages/app/src/modules.ts`, `packages/app/vereino-modules.json` — the new module
- `packages/app/.ai/qa/tests/{_fixtures/activities.ts,activities/**}` — tests
- `.ai/specs/2026-10-20-vereino-club-management.md` — notes under phase 2 steps 1, 3 and 8, changelog
- `.ai/lessons.md`, three lessons; `.ai/runs/2026-10-29-issue-31-activities.md` — this log

## Commands and results

- `yarn verify` — 13/13 passed (subagent's final run and the coordinator's rerun).
- `yarn test:integration:vereino` (whole suite) — 47/47 passed in the subagent's run; coordinator's rerun: 47/47 passed (10.3 min).
- After merging `main` with #27 (PR #55; conflicts only in additive lists of `foundation`, the people README, the lesson catalog and the spec changelog): `yarn verify` 13/13 and `yarn test:integration:vereino` 59/59 passed (12.9 min).
- `yarn db:generate` against a throwaway pgvector container; up, down, up as raw SQL there, then a second `db:generate` with no changes. No `yarn db:migrate`.

## Open problems

- The coach role has no `activities.view` (the spec's coach feature list), so a coach gets 403 on the backend lists and on their own event, and cannot reach the cancel button in the UI; a one-line role-catalogue change or the `/club` calendar (step 4) resolves it — owner decision.
- The backend pages show and enter instants in the browser's time zone; they match the club only in `Europe/Warsaw`.
- Editing a multi-day one-off event through the activity form re-plans it as a single-day session.
- Deferred: attendance pinning (#33), declarations (#32), substitutions and the A05 lists, `reopen`, `advanceWhere`, scores and fixture import, calendars and `/club` (step 4), the public schedule (step 9), the cancellation e-mail (phase 3), `club_core`'s place-in-use rule, enabling `dictionaries`.

## Next steps

- Owner review of the PR and the coach `activities.view` decision; then #32 / #33 (after #27's PR #55 merges) or #34.

## Lessons recorded

- `.ai/lessons/date-fns-tz-dst-offsets-and-wall-time-resolution.md`
- `.ai/lessons/mikro-orm-uuid-array-column-and-advisory-schedule-lock.md`
- `.ai/lessons/prettier-write-changed-files-only.md`
