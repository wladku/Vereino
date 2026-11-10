# Run: issue #126 (E08-S06) — the facility attendant and incident photos

- **Goal and trigger:** cezar task 98102a2a (`om-auto-fix-issue 126`), unattended. Build what PR #228 left open: the facility attendant (`facility_operator` role, `people_role_assignments.place_id`, the place-scoped grant over the place and its descendants) and incident photos.
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (phase 5 step 7, TEST-026), club spec *Users, Permissions, and Scope*; #126; `feat/issue-126-facility-attendant-incident-photos`.
- **Approval:** the owner comment on #126 (2026-11-10, issuecomment-6758333424) approves the `people` migration adding the nullable `people_role_assignments.place_id` with its index and the seeded `vereino_facility_operator` role (`facilities.view`, `facilities.rentals.manage`, `facilities.log.write`, `facilities.incidents.manage`, scoped to the place and its descendants), and keeps the `facilities.rentals.manage` gate on no-show. The incident-photo link table is a `facilities_*` migration of E08, approved on #119 (2026-11-05). Nothing else (dependencies, modules, other migrations) is used.

## Steps

1. Read #126, its comments, the run log of PR #228 and the #128 maintainer pattern; claimed #126 (assignee, `in-progress`, comment issuecomment-6761457673); renamed the branch.
2. `@vereino/core`: the assignable role `facility_operator` (requires a place, implies `member`) and the grant kind `facility_operator` matching `placeId`; tests at 100 %.
3. `people`: `RoleAssignment.placeId` and `Migration20261110072012_people` (offline `db:generate`, `lock_timeout` and `down()` by hand); `roleScopeProblem` takes the section and the place; a facility attendant names a live club place (422 `role_place_invalid`, through `club_core`'s directory by DI); the person scope expands the active attendant assignments with the places' descendants; the Roles tab has a place picker; the person list shows an "Attendant" badge; the persons and role-assignment API carry the role and `placeId`.
4. `facilities`: `PLACE_KINDS` (`facility_operator`, `club_admin`) and `placeTarget`; rentals (create, confirm, cancel, no-show, move — a move to another place is checked too), the quote, the log and incidents use them; the rentals, logs, incidents and entry-ban lists filter by `place_id`; `attendantPlaceIds` limits the calendar and today to the attendant's places (403 elsewhere); the 403 `log_edit_closed` exception follows the club-wide grant (`hasKind`), not the acting role.
5. Incident photos: the byte checks moved from `club_core/lib/files.ts` to `@vereino/core` (`file-format.ts`, re-exported, two users now); `IncidentPhoto` and `Migration20261110074330_facilities` (one new table, `down()` by hand); command `facilities.incidents.photos.add` (count under the incident's row lock inside `persistLink`); `POST /api/facilities/incidents/{id}/photos` and `GET …/photos/{photoId}` (owner, assignment and private partition bound); photos in the incident list, the M-12 "Report incident" dialog and the B-27 edit dialog; en/pl strings.
6. TEST-026 gained the attendant case (role-assignment 422s, place scope of today, calendar, log, incidents, rentals and bans, the log edit window, photos: upload, format, limit, read, coach 403, no delete); TEST-F03 counts the seventh seeded role.
7. Fresh-eyes review by a read-only subagent on `git diff origin/main...HEAD`: no high findings. Fixed: today returned a place's log to an attendant who only maintains it (now the log grant must cover the chosen place); the attendant could change the unchecked case link of an incident (now only the club-wide grant changes it, 403 otherwise; asserted in TEST-026); the photo `Content-Disposition` header (RFC 6266 `filename*`). Left as follow-ups (below).

## Decisions

- Bans: the attendant lists the bans of their places (they enforce them at the door) but does not issue or revoke one — the club spec gives the attendant an "entry ban request", not the ban.
- Calendar and today: "other staff read all club places" — a caller with a club-admin, coordinator or coach grant reads the club even when also an attendant; an attendant-only caller reads their places plus the places they maintain.
- Photos are a link table, not a column: the platform `attachments` module exports only its service (no list by owner), and every Vereino module keeps its own link rows (`club_core_place_files`, imports).
- Photos are never deleted (evidence, like the incident); at most 5, PNG/JPEG/WebP up to 5 MB.

## Commands and results

- `yarn workspace @vereino/core test` → 110 passed, 100 % lines/branches/functions.
- `npx jest src/modules/people/lib src/modules/facilities/lib src/modules/club_core/lib --coverage` → all passed; changed lib files 100 %.
- `DATABASE_URL=<unreachable> yarn db:generate` → `people: generated Migration20261110072012_people.ts`, then `facilities: generated Migration20261110074330_facilities.ts`; every other module "no changes".
- `yarn typecheck`, `yarn typecheck:qa` → clean.
- `yarn test:integration:vereino --filter TEST-026` (1st) → the attendant case failed: `Expected: 422 Received: 500` for an unknown place — `isClubPlace` was given the whole assignment key as the scope (`Trying to query by not existing property Place.personId`); fixed.
- `yarn test:integration:vereino --filter TEST-026` (2nd, with photos) → `1 passed (3.1m)`; the attendant case's first attempt failed in the fixture (`yarn mercato entities seed-encryption … exited 1`, before any tested code ran) and passed on the retry.
- `yarn verify` (1st) → failed at `lint`: 162 errors in the ignored Playwright report `packages/app/.ai/qa/test-results/html/trace/assets/*.js` left by the integration run, plus 6 in this change (`return-await` in the upload route, a ref read in render in `FacilityDialogs.tsx`, a number in a template literal in TEST-026); fixed and the artifacts removed.
- `yarn verify --from lint` → `format:check` failed; `yarn format` (only this change's files); `yarn verify --from format:check` → all 9 steps passed.
- After the review fixes (commit d2e1cb1): `yarn test:integration:vereino --filter TEST-026`, `--filter E08-S06`, `--filter TEST-F03` could not run — the environment failed before any tested code: `yarn mercato people bootstrap-admin … exited 1`, `Failed to obtain auth token (status 500)`, then `❌ Initialization failed: read ECONNRESET` and `PostgreSQL at localhost:32812/vereino_test is not reachable: it refused the connection` (the Testcontainers runtime, which this run may not touch). A second attempt failed the same way. The last green TEST-026 is the one before the review fixes; E08-S06 and TEST-F03 (seven seeded roles) did not run locally — CI runs them on the PR.

- `yarn verify` (full, after the review fixes) → all 14 steps passed.
- Lesson recorded: `.ai/lessons/verify-lint-scans-integration-report-and-scope-is-trusted-only.md`.

## Open problems / next steps

- The attendant's rental dialog cannot search registered renters: institution and person search need `club_core.view` / `people.view`, outside the approved role; an unregistered renter by name works. Needs an owner decision (more features, or a facilities renter search).
- `/club` has no link to `/club/facility` (M-12): the attendant opens it by URL (pre-existing, not introduced here).
- The ban list shows "New ban" and "Revoke" to the attendant (they hold `facilities.incidents.manage`); the server answers 403.
- An ended attendant assignment keeps `vereino_facility_operator` (with `facilities.view`) until the daily role-expiry sync; in that window the calendar and today read like other staff (the whole club).
