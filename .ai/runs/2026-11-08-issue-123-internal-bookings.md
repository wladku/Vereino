# Run — issue #123: internal bookings and `/club/places` (E08-S03)

- **Goal and trigger:** cezar task 707087f2 (`om-auto-fix-issue 123`), unattended. Build facilities spec phase 5 step 4 — staff internal bookings, the occupancy service extended by them, the staff facility calendar `/club/places` with "Book" for a group (one-off event) or a general purpose, cancellation, supersession of held external requests (TEST-033).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (In progress, phase 5); #123 (epic #119, depends on #122 — merged 2026-11-07 as #210); `feat/issue-123-club-places-bookings`. The name `feat/issue-123-internal-bookings` is held by the stopped worktree of the 2026-11-07 run (`.ai/runs/2026-11-07-issue-123-internal-bookings-blocked.md`, carried into this branch).
- **Approval:** the owner's comment on #119/#121 (2026-11-05) approves the `facilities_*` migrations of E08 (#121–#129). Not approved and not done: new dependencies, `yarn db:migrate` against a real database.

## Steps

1. Checked the dependency (#122 closed, #210 merged); claimed #123 (assignee, `in-progress`, claim comment); renamed the task branch.
2. `facilities_internal_bookings` (`InternalBooking`, every spec column; purpose and cancel reason encrypted) and `Migration20261108152351_facilities.ts` generated offline (unreachable `DATABASE_URL`), header and `down()` added — one new table, three indexes.
3. `lib/internal-bookings.ts` (status table, period and start checks, supersession of held requests, calendar window and dates, who may cancel) with unit tests at 100 %.
4. `services/calendar.ts` (entries on a place family with staff labels — activity, renter, purpose · booker, closure reason; the staff calendar read); `services/occupancy.ts` counts confirmed bookings and the occupancy provider returns them with the reason `booking`; closures flag bookings (`flagged.bookings`); `activities.placeSessions` entries carry the activity name and group, and a new `sessionsByIds` read (additive).
5. Commands `facilities.internal_bookings.create|cancel` (occupancy lock, `place_closed`, `rental_conflict` with labelled `conflicts`, supersession in the same unit of work) and `facilities.rentals.supersede_by_sessions` (job context) dispatched by the subscriber `facilities:supersede-requests` on `activities.occurrence.generated`, so a group event or a series also supersedes held requests.
6. Routes `POST /api/facilities/internal-bookings`, `DELETE /api/facilities/internal-bookings/{id}`, `GET /api/facilities/internal-bookings/options`, `GET /api/facilities/calendar`; ACL `facilities.bookings.create` (already on the coach and coordinator roles); events `facilities.internal_booking.created|cancelled|updated`, `facilities.rental.superseded`; en + pl error and audit keys.
7. UI (M-11 `/club/places`, `/club/places/[placeId]`, the Book dialog, cancellation, en + pl, `E08-S03-club-places.spec.ts`): delegated to one subagent with disjoint files (`facilities/frontend/club/places/**`, `facilities/components/club-places/**`, `facilities.places.*` keys, the E08-S03 spec). It reported `yarn generate`, `yarn typecheck`, `yarn typecheck:qa`, eslint, `yarn ds:check`, `yarn i18n:check-hardcoded --strict` and `--filter E08-S03` green; the coordinator reviewed and committed it.
8. Integration: `TEST-033-internal-bookings.spec.ts` (all five acceptance criteria, any zone, conflicts with session/rental/booking, closure and opening hours, cancellation rules, supersession by a booking and by a group event, TEST-058 (c)); the QA probe `_fixtures/facilities-request-probe/probe.mjs` stores a held `pending_approval` request, standing in for E08-S05; TEST-022 and TEST-027 expect `flagged.bookings`.

## Decisions

- **Conflict code:** an occupied slot answers `rental_conflict`, the code the club spec's internal-bookings row names, with `conflicts[]` carrying `kind`, `placeId` and a staff `label`.
- **"For a group"** stays the one-off event of `activities` (DD-26, `POST /api/activities/events`); its supersession of held requests runs post-commit through the subscriber, because `activities` must not import `facilities` (DD-20).
- **Section of a general booking:** any active section of the club (the options list the coordinator's sections first); the section decides which coordinator may cancel. Creating is club-wide for coaches and coordinators (club spec: "facilities — whole club").
- **Supersession e-mail deferred to E08-S05:** `dispatch` recipients need a person id; the bare-address recipient the foundation III spec designs for phase 5 requesters does not exist yet, and no route creates requests before E08-S05. This story changes the status and emits `facilities.rental.superseded`; E08-S05 adds the e-mail with its other request e-mails.
- **Not undoable:** bookings only move forward (DD-46); a wrong booking is cancelled.

## Files changed

See the commits; areas: `packages/app/src/modules/facilities/**`, `packages/app/src/modules/activities/services/place-sessions.ts`, `packages/app/.ai/qa/tests/{facilities/**,_fixtures/facilities.ts,_fixtures/facilities-request-probe/}`, the spec, its changelog entry and the run logs.

## Commands and results

- `npx jest src/modules/facilities/lib --coverage` — 6 suites, 51 tests pass; `facilities/lib` 100 % lines, branches, functions (after adding the three new codes to `error-codes.test.ts`, which first failed on them).
- `yarn generate`, `yarn typecheck` — ok. `DATABASE_URL=<unreachable> yarn db:generate` — only `facilities` changed.
- `yarn contracts:check` — 8 modules, 167 error codes, 0 problems. `yarn spec-changelogs:check` — valid.
- `--filter TEST-033` — run 1: failed, the probe found no `facilities_rentals` metadata (MikroORM 7 returns a `Map`); run 2: `em.persistAndFlush is not a function` (gone in MikroORM 7); run 3: 2 passed (TEST-033, TEST-058 (c)); after the review fixes (with the overnight case): 2 passed.
- Regressions: `--filter TEST-027` 3 passed; `--filter E08-S03` 1 passed; `--filter TEST-034` first failed to start ("Another Open Mercato production server is already running … pid 683452"): a server left by the run I had stopped at its time limit; after `taskkill` of that process, 1 passed. `--filter TEST-022` first: 2 failed with `exited 3221225794` (a `seed-encryption` child and a Playwright worker crashed — the environment flake #122's log records); second: the build caught a half-done edit (`Property 'bookings' does not exist on type 'Partial<FlaggedCounts>'`); third, on the final code: 5 passed.
- `yarn verify` (final, after the review fixes) — all 14 steps passed.

## Review

A fresh-eyes subagent read `git diff origin/main...HEAD` (read-only): approve, no High. Fixed: (M) an overnight or multi-day booking on a place without opening hours answered `place_closed` — the opening-hours check now runs only when the place chain has hours (TEST-033 case added); (L) the supersession command first probes for any held request and stops when there is none; (L) the closure toast counts bookings (en + pl); (L) a second click on Cancel while the first runs is ignored. Left as follow-ups: the timeline does not name the parent or sub-place of a family entry; place cards count only the place's own entries; an unknown place shows the generic error; TEST-033 has no admin cancel or series supersession case; E08-S03 runs no axe scan.

## Open problems

- The superseded requester's e-mail (see Decisions) — E08-S05 (#125).
- A group event is not checked against the place's opening hours (`activities` does not read them); a closure does refuse it (reason `closure`).
- `/club/places` "For a group" offers the groups the caller coaches (`/api/activities/events/options`); a coordinator who coaches no group sees none.
- The Facilities tab of the member navigation shows only on the two facilities pages; adding it to the other modules' frames is a follow-up.
- The calendar read is whole-club for `facilities.view`; the attendant's place scope (E08-S04) and the maintenance planner's redacted read (E08-S08) are not applied yet.
- The pure timeline helpers live in `components/club-places/places-client.ts`, outside the `lib/` coverage rule.
- Owner report "club time" (TEST-033's last oracle) waits for the owner report (phase 5 step 8).

## Next steps

- E08-S05 (#125): online requests, the bare-address `dispatch` recipient and the request e-mails, including `superseded`.
