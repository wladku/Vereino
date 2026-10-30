# Issue #32 — member calendar and attendance declarations (E03-S03)

- **Date:** 2026-10-30
- **Agent / tool:** Claude Code (Fable 5.1), `om-auto-fix-issue 22` → feature route → `om-auto-implement-spec` → `om-auto-create-pr` (plain engine), then `om-auto-review-pr` and `om-auto-qa-pr`
- **Trigger:** the product owner chose "story by story" for epic #22 (E03): #32 first, then #33, with #34 in parallel
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 steps 4 and 5 (REQ-006, REQ-007; TEST-008, TEST-009, TEST-011, TEST-014, TEST-055 presence part) on `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` P-23 and P-25; issue #32; branch `feat/issue-32-member-calendar-declarations` from `main` (`f0ef599`) in the worktree `C:\Users\wkuc\vereino-issue-32`
- **Status:** in-progress

Source doc: .ai/specs/2026-10-20-vereino-club-management.md

## Goal

A guardian with children in two sections sees one calendar with place and times, reports absences for trainings and confirms matches; a ward with an account declares according to the club's policy, with the guardian confirming when the policy says so; the expiry job applies the policy default after the time limit.

## Scope

- **In:** foundation II P-23 (`CalendarItem`, `CalendarList`, `toScheduleItem`, the member shell as the first `@vereino/ui` component) and P-25 `advanceWhere`; `activities` attendance declarations (`activities_attendances`), declaration policies (`activities_attendance_policies`) with their CRUD and admin page, the `declare` and `guardian-decision` commands and routes, the `activities:expire-guardian-confirmations` job, the two declaration notifications, `GET /api/activities/calendar` (and one session for the member view), the member pages `/club/calendar` and `/club/occurrences/[id]`, the calendar and attendance tiles on `/club` through an injection spot; TEST-008, TEST-009, TEST-011 (guardian part), TEST-014, TEST-055 (presence part); docs and the run log.
- **Out (non-goals):** the coach attendance check-off and session close (#33), the guardian-contacts endpoint (#34), substitutions, the "needing a coach" and "unsettled" lists, the coach units report and settlement (A05), personal declaration links (REQ-017), `is_away`, scores, fixture import, the public schedule block, the coordinator's `ScheduleView` calendar perspective on `/backend/activities/occurrences` (step 4's backend half — `toScheduleItem` ships, the perspective lands with #33's backend work), the cancellation e-mail (phase 3).

## Implementation Plan

### Phase 1: Foundation primitives (P-23, P-25)

1. `@vereino/core`: `CalendarItem` type, `groupCalendarItemsByDay` (club-zone buckets), `validCalendarItems`; unit tests at 100 %.
2. `foundation/services/transitions.ts`: `advanceWhere(em, Entity, { where, from, to, set })` returning the ids that changed; exported from `@/modules/foundation`; README row.
3. `@vereino/ui`: `MemberShell` (presentational header, nav and main), `CalendarList` (Tailwind list over `CalendarItem[]`), `toScheduleItem`; the pure view-model helpers in `.ts` files with node tests; Jest render tests (`react-dom/server`) in `packages/app` for the `.tsx` files; `people`'s `ClubFrame` renders `MemberShell`.

### Phase 2: Attendance data and rules (`activities`)

1. Entities `Attendance` / `activities_attendances` and `AttendancePolicy` / `activities_attendance_policies` with their indexes, validators, migration generated against a throwaway Postgres (SQL reviewed, `down()` by hand).
2. `lib/policy.ts`: default policies, the resolver (group > away trip > activity type > club), the declaration transition table, the kind rule (`absence_only` refuses `yes`), the closing rule, who declares and the per-session summary; error codes; 100 % unit coverage.
3. `setup.ts`: default policies seeded idempotently; the 15-minute expiry schedule registered (P-12).

### Phase 3: Commands, job and routes

1. `activities.attendance.declare` + `POST /api/activities/attendance/declare` (self, guardian, coach, coordinator, club administrator — least-privileged first; policy applied to a minor declaring for themself).
2. `activities.attendance.guardian_decide` + `POST /api/activities/attendance/{id}/guardian-decision`.
3. `activities.attendance.expire` job command on `advanceWhere`, worker `workers/expire-guardian-confirmations.ts`, CLI `activities expire-guardian-confirmations --tenant --org [--now]`.
4. Policies: `activities.attendance_policies.create|update|delete`, CRUD `/api/activities/attendance-policies`, page `/backend/activities/policies`.
5. Events `activities.attendance.declared|guardian_decided`, `activities.attendance_policy.*`; notifications `activities.ward_declared`, `activities.guardian_confirmation_needed` with their subscriber.

### Phase 4: Calendar read API

1. Additive directory reads: `groups.directory.membershipsOf` (participant memberships of persons in a window), `people.personDirectory.presenceConsents`, `clubCoreDirectory.findPlaces` with address and coordinates.
2. `GET /api/activities/calendar` (`as` self | guardian | coach | coordinator, `from`/`to` ≤ 62 days, `personId`; declarations, declaration kind, called-up children per `show_called_up_children` and consent) and `GET /api/activities/calendar/{id}` for the member session view.

### Phase 5: Member UI

1. `/club/calendar`: `MemberShell` + range toolbar (this week / next week, prev / next) + `CalendarList`, ward filter, loading / empty / error states, 375 px.
2. `/club/occurrences/[id]`: session details with place, per-ward "Report absence" or "Attending / Not attending", the guardian's pending decisions, called-up children, "declarations closed", `aria-live`.
3. `/club` Today: the calendar tile (today and tomorrow) and the attendance tile (decisions waiting) as an `activities` injection widget on the spot `vereino:club:today:tiles` rendered by `people`'s Today page.

### Phase 6: Integration tests and gate

1. Fixtures; TEST-008 (one guardian calendar across two sections; coordinator sees their section only; coach sees own groups) and TEST-011 (another family's child → 403).
2. TEST-009 (policies `immediate`, `guardian_confirm`, `guardian_only`; `yes` on a training → 422; the expiry job applies the default; 409 after the start) and TEST-055 presence part (called-up children only under `consented` and with the consent).
3. TEST-014 (Today → session → declaration on a phone, both colour schemes, axe); `yarn verify`; focused `yarn test:integration:vereino` runs.

### Phase 7: Documentation

1. READMEs (`activities`, `foundation`, `@vereino/ui`), the club spec notes on phase 2 steps 4 and 5 with a Changelog row, the foundation II spec (V-F05, P-23, P-25 built), this run log, lessons.

## Risks

- `advanceWhere` and the expiry job are the first job-driven status change: a retry must not re-emit events — the conditional UPDATE returns only the ids it changed.
- The member session view reads sessions outside `activities.view`: every read is narrowed to the caller's own or wards' memberships; a session outside them answers 404, never another family's data.
- `.tsx` in `@vereino/ui` is not loadable by `node --test` (type stripping has no JSX): the pure parts live in `.ts` files, the components get Jest render tests in `packages/app` (V-F05 fallback without `jsdom`).
- The Today tile crosses the `people` → `activities` module boundary: an injection widget keeps `people` free of any `activities` import.

## Decisions

- (filled as the run proceeds)

## Files changed

- (filled as the run proceeds)

## Commands and results

- (filled as the run proceeds)

## Open problems

- (filled as the run proceeds)

## Next steps

- (filled as the run proceeds)

## Lessons recorded

- (filled as the run proceeds)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Foundation primitives (P-23, P-25)

- [ ] 1.1 CalendarItem and day bucketing in @vereino/core
- [ ] 1.2 advanceWhere in foundation
- [ ] 1.3 MemberShell, CalendarList and toScheduleItem in @vereino/ui

### Phase 2: Attendance data and rules

- [ ] 2.1 Attendance and AttendancePolicy entities with the migration
- [ ] 2.2 Declaration policy resolver and rules in lib/policy.ts
- [ ] 2.3 Default policies and the expiry schedule in setup

### Phase 3: Commands, job and routes

- [ ] 3.1 Declare command and route
- [ ] 3.2 Guardian decision command and route
- [ ] 3.3 Expiry job command, worker and CLI
- [ ] 3.4 Attendance policies CRUD and admin page
- [ ] 3.5 Events, notifications and the declaration subscriber

### Phase 4: Calendar read API

- [ ] 4.1 Additive directory reads in groups, people and club_core
- [ ] 4.2 Calendar routes

### Phase 5: Member UI

- [ ] 5.1 /club/calendar page
- [ ] 5.2 /club/occurrences/[id] page
- [ ] 5.3 Today tiles through the injection spot

### Phase 6: Integration tests and gate

- [ ] 6.1 TEST-008 and TEST-011
- [ ] 6.2 TEST-009 and TEST-055 presence part
- [ ] 6.3 TEST-014 and the full gate

### Phase 7: Documentation

- [ ] 7.1 READMEs, spec notes, run log and lessons
