# Issue #96: E06-S14, coach contracts and the monthly coach units report

- **Date:** 2026-11-07
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run by cezar; one subagent built the contracts admin UI (step 6)
- **Trigger:** `/om-auto-fix-issue 96` (E06-S14, epic #82)
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 step 7 (REQ-008, REQ-021, AC-008, AC-021, TEST-013); #96; `feat/issue-96-coach-contracts-units-report`
- **Status:** implemented, PR opened (see the issue)

## Goal

Coach contracts on `/backend/club/contracts` (party, kind, period, coach rates per the club's settlement model, 409 on overlap) and the monthly coach units report — admin page with month/section filters, amounts for the administrator, "n sessions", the unsettled warning and CSV; a coach sees only their own row, on the phone as More → My units. Plus the R14 document points the issue folds in.

## Steps

1. Checked the gates: #95 is on `main` (9020d6d); the A05 hold was lifted (D30, owner comment of 2026-11-04); the migration was approved (owner comment of 2026-11-05). No open PR or claim; claimed the issue (assignee, `in-progress`, claim comment naming this run). Renamed the task branch.
2. Read the spec rows (DD-09, DD-14, glossary *Coach settlement*, Data Models `Contract` and `Activity.is_away`, the API row, B-16 wireframe, TEST-013), README B-07/B-16 and the #95 code the report builds on (substitution entries, the unsettled predicate).
3. `club_core`: `Contract` entity (`terms` encrypted JSON text), `lib/contracts.ts` (pure), validators, three error codes, commands `club_core.contracts.create|update|delete` (undoable, per-party advisory lock, overlap re-checked on undo), CRUD route, events, `club_core.contracts.manage`, DI `clubCoreContracts`.
4. `activities`: `is_away` on the activity (entity, validators, commands, API, form checkbox) — also wired into the `away_trip` declaration policy, which had been hard-coded to "not away" until the column existed; `lib/coach-units.ts` (counting, pricing in both models, CSV), `services/coach-units.ts`, `GET /api/activities/reports/coach-units`, two report features in `acl.ts` (already in the role catalogue).
5. `yarn db:generate` → one migration per module with exactly the new column / table; rewritten in house style with `down()` by hand; the `club_core` snapshot was spliced so its diff holds only the new table (the regenerated file reformatted unrelated arrays — lesson `db-generate-snapshot-style-and-public-block-scope`).
6. Subagent: `/backend/club/contracts` list, create and edit (`ContractsTable`, `ContractForm`, `contracts-shared.ts`) and the `club_core` catalog keys. Reviewed its diff: CRUD helpers only, lock token through `CrudForm`/`deleteCrud`, no payments import.
7. UI: `CoachUnitsReport` (B-16), `coach-units-client.tsx` (shared types and the `<details>` "n sessions"), `/club/coach/units` (`ClubUnitsPage`), `memberNav` item "My units" for a coach context (`@vereino/ui`, label key `myUnits` in the three member-frame catalogs).
8. Tests: unit tests for `club_core/lib/contracts.ts`, `activities/lib/coach-units.ts` (100 %) and `member-nav` (`@vereino/ui`); integration test `E06-S14-coach-contracts-units-report.spec.ts`.
9. Docs: README B-07, B-16, the member bar line; spec step 7 annotation and changelog file; both module READMEs; a lesson.

## Decisions

- **Default settlement model (R14):** stays `units_per_contract`, the shipped default. A club without a stored settings row reads the default, so switching it to `fixed_base_adjusted` (the issue's non-blocking proposal) would silently re-price every club that never saved the setting. Recorded in README B-16; the owner can still change it.
- **Split month (R14):** each counted session is priced by the coach contract in force on its own day; the monthly base is counted once, from the latest contract overlapping the month. No contract in the month → "No contract"; a missing rate or a counted session on a day no contract covers → "Incomplete contract" (no partial amount).
- **Units:** own coach = the coach before the session's first substitution entry; planned = own `training` `done` sessions; handed over = own ones someone else led; taken over = others' ones led; balance = planned − handed over + taken over; matches = `match`/`sparring` led; trips = sessions of an `is_away` activity led (a handed-over away session is the substitute's trip).
- **Who sees what:** `activities.reports.view` → administrator every section, coordinator their sections (another section → 403); `activities.reports.view_own` or `mine=1` → own row only (`self` grant), every section; amounts, `contractState` and the CSV amount column only with `club_core.contracts.manage`. The coach never sees an amount (issue AC).
- **Contracts:** stored terms are only the current model's rates, each required; party and kind fixed after create (an edit changes period and terms); `attachment_id` of the data model not added — no file upload is in scope. A person party is checked through the optional `people.personDirectory` by DI name (`people` requires `club_core`).
- **Migration scope:** the owner's approval names "the `activities` migration for the coach contracts and rates … as the spec designs it". The spec designs contracts in `club_core` (DD-09) and `is_away` in `activities`, so both migrations ship here; flagged on the PR for the reviewer.
- **Phone:** My units appears behind More for a coach context only; a coordinator without a coach role keeps the admin report.

## Files changed

- `packages/app/src/modules/club_core/`: `data/entities.ts`, `data/validators.ts`, `data/queries.ts`, `encryption.ts`, `events.ts`, `acl.ts`, `di.ts`, `lib/contracts.ts`, `lib/error-codes.ts`, `commands/contracts.ts`, `commands/shared.ts`, `services/contracts.ts`, `api/contracts/route.ts`, `api/shared.ts`, `migrations/Migration20261107084915_club_core.ts` + snapshot, `backend/club/contracts/**`, `components/ContractForm.tsx`, `ContractsTable.tsx`, `contracts-shared.ts`, `i18n/en.json`, `pl.json`, `README.md`, unit tests.
- `packages/app/src/modules/activities/`: `data/entities.ts`, `data/validators.ts`, `acl.ts`, `lib/coach-units.ts`, `lib/error-codes.ts`, `lib/policy.ts`, `commands/activities.ts`, `commands/attendance.ts`, `services/coach-units.ts`, `services/calendar.ts`, `services/read.ts`, `api/reports/coach-units/route.ts`, `api/activities/route.ts`, `api/activities/[id]/route.ts`, `api/shared.ts`, `migrations/Migration20261107084915_activities.ts` + snapshot, `backend/activities/reports/coach-units/**`, `frontend/club/coach/units/**`, `components/CoachUnitsReport.tsx`, `coach-units-client.tsx`, `club/ClubUnitsPage.tsx`, `ActivityForm.tsx`, `activity-form-values.ts`, `client-helpers.ts`, `i18n/en.json`, `pl.json`, `README.md`, unit tests.
- `packages/ui/src/member/member-nav.ts` + test; `people` and `communication` `i18n` (`club.nav.myUnits`).
- `packages/app/.ai/qa/tests/activities/E06-S14-coach-contracts-units-report.spec.ts`.
- `docs/ux-concept/README.md`, the spec (step 7 note), `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-07-issue-96-coach-contracts-units-report.md`, `.ai/lessons/client-imported-validators-stay-off-foundation.md` + catalog row, this log.

## Commands and results

- `yarn db:generate` → `activities: generated Migration20261107084915_activities.ts`, `club_core: generated Migration20261107084915_club_core.ts`; every other module "no changes". Never migrated.
- `yarn typecheck` (first) → 7 errors (partial-load types, `isAway` missing from a `fields` list in `commands/attendance.ts`); fixed → exit 0.
- `npx jest` on the two new lib tests with coverage → 16 passed, 100 % lines/branches/functions; `packages/ui` `yarn test` → 113 passed, 100 %.
- `yarn verify` (first) → failed at `lint`: 9 errors in my report files (`restrict-template-expressions`, `no-confusing-void-expression`, `no-base-to-string`); fixed. `--from lint` → failed at `test`: `club_core error codes` pins the full table (`1 failed, 655 passed`); added the three codes. `--from test` → failed at `build`: "Module not found" in `@grpc/grpc-js`; import trace `InstitutionsTable.tsx` → `club_core/data/validators.ts` → `@/modules/foundation` (my new `validityShape` import pulled server code into the client bundle). Rebuilt the two helpers locally from `@vereino/core` (lesson added). `--from build` → passed.
- `yarn test:integration:vereino --filter E06-S14`, run 1 → `Expected: 201, Received: 409` `occurrence_coach_conflict` on creating the third activity: the test started each session before creating the next, and a moved session took the next one's slot (the test's defect). Restructured: create all, then start all.
- Run 2 → attempt 1 `Test timeout of 420000ms exceeded` (cold server), retry: `Expected pattern: /1[\s ,.]?730/` — received "Incomplete contract": the test left the fixed-model rates on the contract after switching the club back to the units model (the test's defect; the app was right). The test now restores the units rates and asserts 173000 via the API first; timeout 600 s.
- Run 3 → every API and browser check passed up to the axe scan: `expect(violations).toEqual({ light: [], dark: [] })` received `{}` — the helper returns only schemes with violations; assertion corrected to `{}`.
- Run 4 → `1 passed (1.5m)`.
- Final `yarn verify` after the last change: generate, typecheck, typecheck:packages, typecheck:qa passed; the run then stalled in `lint` and was stopped at the 1-hour task limit (no output). `yarn verify --from lint` → all 10 steps passed (lint 122 s, `test` 656 passed with the 100 % thresholds, build 46 s).

## Open problems

- The unsettled warning is not covered by the integration test (it needs a session that ended over 24 h ago in the current month, which depends on the day the test runs); the predicate is the B-15 one, already tested by E06-S13.
- Not built from step 7: camp and match score (TEST-029); the contract file attachment.

## Next steps

- Review on the PR; the owner may override the default settlement model or the split-month rule.
