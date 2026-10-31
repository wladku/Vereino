# Issue #32 — member calendar and attendance declarations (E03-S03)

- **Date:** 2026-10-30
- **Agent / tool:** Claude Code (Fable 5.1, then Opus 5.5 after a model switch), `om-auto-fix-issue 22` → feature route → `om-auto-implement-spec` → `om-auto-create-pr` (plain engine), then `om-auto-review-pr`; three implementation subagents (the `@vereino/ui` member layer, the policies admin page, the API integration tests) with disjoint files
- **Trigger:** the product owner chose "story by story" for epic #22 (E03): #32 first, then #33, with #34 in parallel
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 steps 4 and 5 (REQ-006, REQ-007; TEST-008, TEST-009, TEST-011, TEST-014, TEST-055 presence part) on `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` P-23 and P-25; issue #32; PR #61; branch `feat/issue-32-member-calendar-declarations` from `main` (`f0ef599`) in the worktree `C:\Users\wkuc\vereino-issue-32`
- **Status:** complete

Source doc: .ai/specs/2026-10-20-vereino-club-management.md

## Goal

A guardian with children in two sections sees one calendar with place and times, reports absences for trainings and confirms matches; a ward with an account declares according to the club's policy, with the guardian confirming when the policy says so; the expiry job applies the policy default after the time limit.

## Scope

- **In:** foundation II P-23 (`CalendarItem`, `CalendarList`, `toScheduleItem`, `MemberShell` as the first `@vereino/ui` components) and P-25 `advanceWhere`; `activities` declarations and policies with their commands, routes, job, notifications and admin page; the role calendar API; `/club/calendar`, `/club/occurrences/[id]` and the Today tiles; TEST-008, TEST-009, TEST-011 (declaration half), TEST-014 (guardian half), TEST-055 (presence part).
- **Out (non-goals):** the coach check-off and session close (#33), the guardian-contacts endpoint (#34), substitutions and the A05 lists, the units report and settlement (A05), declaration links (REQ-017), `is_away`, the coordinator's `ScheduleView` perspective on `/backend/activities/occurrences`.

## Implementation Plan

Phases 1–7 as listed under *Progress*: foundation primitives; attendance data and rules; commands, job and routes; the calendar read API; the member UI; integration tests and the gate; documentation.

## Risks

- `advanceWhere` is the first job-driven status change: a retry must not re-emit events — it returns only the ids its conditional UPDATE changed (TEST-009 runs the job twice).
- Member reads bypass `activities.view`: they are narrowed to the caller's own or wards' participant memberships (TEST-008, TEST-011).

## Decisions

- **Member calendars read by membership, not `activities.view`.** A member perspective (`as=self` / `guardian`) lists the sessions of the groups the member or the wards are participants of on each session date; anything else is 404 (session) or 403 (person). This also gives a coach `as=coach` on `/club/calendar` without `activities.view` — the open problem of #31 — with no role-catalogue change.
- **The expiry columns live on the declaration row.** `pending_until` and `timeout_outcome` are copied from the resolved policy when the minor declares, so the 15-minute job needs no policy resolution and a later policy change does not rewrite pending rows. The job runs one `advanceWhere` per outcome; settling a row clears both columns, as a guardian's decision does.
- **`advanceWhere` takes a `statusField`.** Attendance keeps its status in `declaration_status` (the club spec's column), so the primitive does not assume a `status` column.
- **The Today tiles are an injection widget.** `people` renders the spot `vereino:club:today:sections`; `activities` mounts its calendar and attendance tiles there, so `people` imports nothing of `activities`. The app's `ClientBootstrap` classified `/club` as a public route that loads no injection registry, so a `member` profile (`/club`, `/club/*` → translations + injection) was added — the one change to an app scaffold file.
- **`activities` member pages reuse the shell, not `people`'s frame.** They read `/api/people/me` over HTTP with `people`'s query key and shape (one cache entry) and render `MemberShell` with the same navigation; the locale cookie effect stays on `people`'s pages, which a member opens first.
- **The `.tsx` member components are tested under `node --test`** through a TypeScript `transpileModule` load hook (`packages/ui/scripts/register-tsx.mjs`), which confirms V-F05 without `jsdom`; Jest render tests in `packages/app` prove the app resolves the package.
- **Policies page:** `CrudForm` `visibleWhen` for the group and type fields; the scope is read-only after creation (the update schema has none); the page sits in the Schedule navigation group, not in settings.
- **Default policies** are seeded by `activities` `seedDefaults`; tenants created through the API in tests do not run it, so the test fixture creates the missing defaults through the CRUD route (idempotent).

## Files changed

- `packages/core/src/calendar.ts`, `index.ts`, `__tests__/calendar.test.mjs` — P-23 types and day buckets
- `packages/app/src/modules/foundation/{services/transitions.ts,index.ts,di.ts,README.md}` — `advanceWhere`
- `packages/ui/{package.json,README.md,scripts/register-tsx.mjs,src/index.ts,src/member/*,src/__tests__/*}`, `yarn.lock` (the `@vereino/core` workspace link only) — the member layer
- `packages/app/src/modules/activities/**` — entities and migration `Migration20261030211021_activities`, `lib/policy.ts` (+ tests), commands `attendance.ts` and `policies.ts`, routes `attendance/declare`, `attendance/[id]/guardian-decision`, `attendance-policies`, `calendar`, `calendar/[id]`, services `calendar.ts`, `declaration-notice.ts`, `club-setup.ts`, `directory.ts`, the subscriber, the worker, the CLI, events, notifications, ACL, error codes, i18n, the member pages and components, the Today widget, the policies pages, README
- `packages/app/src/modules/{groups,people,club_core}/services/*directory.ts` — additive reads (memberships of persons, presence consents, place address and coordinates)
- `packages/app/src/modules/people/{components/club/*,i18n/*}` — `ClubFrame` on `MemberShell`, the Calendar link, the injection spot on Today
- `packages/app/src/components/ClientBootstrap.tsx` — the `member` profile
- `packages/app/src/__tests__/ui/*` — Jest render tests
- `packages/app/.ai/qa/tests/_fixtures/attendance.ts`, `activities/TEST-008…`, `TEST-009…`, `TEST-011…`, `TEST-014…`, `TEST-055-called-up-children…`
- `.ai/specs/2026-10-20-vereino-club-management.md` (notes under phase 2 steps 4 and 5, Changelog), `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` (Changelog), `.ai/specs/2026-10-27-vereino-foundation-primitives.md` (V-F05, Changelog)
- `.ai/runs/2026-10-30-issue-32-member-calendar-declarations.md` — this log

## Commands and results

- `yarn db:generate` against a throwaway `pgvector/pgvector:pg17-trixie` container (port 55442, explicit `DATABASE_URL`, removed afterwards; the generated `packages/app/.env` deleted): `activities: generated Migration20261030211021_activities.ts`, the other modules "no changes"; up, down, up as raw SQL there. No `yarn db:migrate`.
- `yarn workspace @vereino/core test` — all files 100 % line, branch, function.
- `yarn workspace @vereino/ui test` — 23 pass, 0 fail, all files 100 %; Jest `src/__tests__/ui` — 8 passed; `activities` lib Jest — 23 passed.
- `yarn verify` — first run failed at `lint` (six `no-confusing-void-expression` in the member pages), fixed with `eslint --fix`; `yarn verify --from lint` passed; after the fixes below the full gate passed again (13/13).
- `yarn test:integration:vereino --filter "activities/TEST-0"` — 9 passed, 2 failed: TEST-009 (`pendingUntil` still set on a row the job settled — the job did not clear the expiry columns) and TEST-014 (no calendar tile on `/club` — the `/club` route loaded no injection registry). After the fixes: TEST-009 1 passed; TEST-014 failed twice more on its own assertions (the `StatusBadge` drops `data-testid`, wrapped in a span; the week buttons and long action labels overflowed at 320 px, now wrap) and then passed; TEST-006 2 passed and J-001 1 passed as regressions of `/club`.

## Review

`om-auto-review-pr` could not submit a review: the auto-mode classifier refused an approving review of the automation's own PR (self-approval). A fresh-context read-only reviewer ran instead and reported "request changes" with 14 findings; all were applied in one commit, then the gate (13/13) and the integration specs (`activities/TEST-0*` 11 passed, TEST-006 2 passed) ran again:

1. The `ClientBootstrap.tsx` patch is now on the S3.1 local-patch list with a Changelog row in the engineering standards spec, so upgrade runs re-apply it.
2. `advanceWhere` re-checks the whole `where` in each UPDATE: a ward who re-declares between the job's select and update (a fresh `pending_until`) is no longer settled by the old deadline.
3. The guardian decision checks the lock token (`lock: 'updated_at'`) and the declare command checks it when the client sends one; the member pages send the `updatedAt` they showed and surface 409 with the conflict bar.
4. `pending_until` is capped at the session start, so the default applies at kick-off rather than a day later.
5. The undo of a declaration or a decision asserts the declarations are still open and the row is unchanged since the command (409 otherwise).
6. Policy writes: a coordinator writes only `group` policies of their sections' groups; `club`, `activity_type` and `away_trip` policies only the club administrator; reading stays club-wide.
7. A staff declaration (acting role coach, coordinator or club administrator) also needs `activities.coach`.
8. The club spec's calendar API row describes the shipped shape.
9. The declare command checks participation before the declaration window, so it is no status oracle for other groups' sessions.
10. Undo events carry the real acting role; the decision's undo is flagged `undo`.
11. `ActivitiesClubFrame` applies the member locale like `people`'s frame.
12. Seeding the default policies skips a key the club soft-deleted.
13. Declaration and decision buttons name the ward for screen readers.
14. The coach calendar tests the `scopeWhere` no-grant sentinel instead of any `id` filter.

## Open problems

- The coordinator's calendar perspective (`ScheduleView` through `toScheduleItem`) on `/backend/activities/occurrences` is not built; `GET /api/activities/calendar?as=coordinator` serves it.
- `is_away` does not exist yet, so the `away_trip` policy never applies.
- `activities` member pages do not run `people`'s locale effect; a member who opens `/club/calendar` first sees the request locale until they visit `/club`.
- Tenants created before this change (none deployed) would need the default policies and the expiry schedule seeded once (rerun of `seedDefaults`).
- The policies page shows "Add" to every coordinator; a coordinator choosing a club-wide scope gets 403 from the server (the form surfaces it).

## Next steps

- Review and merge PR #61; then #33 (coach check-off and session close: the actual-attendance columns exist).

## Lessons recorded

- `.ai/lessons/club-routes-need-the-member-bootstrap-profile.md`

## Progress

PR: #61

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Foundation primitives (P-23, P-25)

- [x] 1.1 CalendarItem and day bucketing in @vereino/core — a73ab3a
- [x] 1.2 advanceWhere in foundation — a73ab3a
- [x] 1.3 MemberShell, CalendarList and toScheduleItem in @vereino/ui — 3db980f

### Phase 2: Attendance data and rules

- [x] 2.1 Attendance and AttendancePolicy entities with the migration — ee7ec32
- [x] 2.2 Declaration policy resolver and rules in lib/policy.ts — ee7ec32
- [x] 2.3 Default policies and the expiry schedule in setup — ee7ec32

### Phase 3: Commands, job and routes

- [x] 3.1 Declare command and route — ee7ec32
- [x] 3.2 Guardian decision command and route — ee7ec32
- [x] 3.3 Expiry job command, worker and CLI — ee7ec32
- [x] 3.4 Attendance policies CRUD and admin page — ee7ec32, 441b2de
- [x] 3.5 Events, notifications and the declaration subscriber — ee7ec32

### Phase 4: Calendar read API

- [x] 4.1 Additive directory reads in groups, people and club_core — ee7ec32
- [x] 4.2 Calendar routes — ee7ec32

### Phase 5: Member UI

- [x] 5.1 /club/calendar page — 441b2de
- [x] 5.2 /club/occurrences/[id] page — 441b2de
- [x] 5.3 Today tiles through the injection spot — 441b2de

### Phase 6: Integration tests and gate

- [x] 6.1 TEST-008 and TEST-011 — 4e84fa2
- [x] 6.2 TEST-009 and TEST-055 presence part — 4e84fa2
- [x] 6.3 TEST-014 and the full gate — 4e84fa2 and the fix commit

### Phase 7: Documentation

- [x] 7.1 READMEs, spec notes, run log and lessons — the fix commit
- [x] Post-review fixes (14 findings of the read-only review) — the review-fix commit
