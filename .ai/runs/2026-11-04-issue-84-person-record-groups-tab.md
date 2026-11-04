# Issue #84: the person record's Groups tab, `?tab=` links, create lands on guardianship, account status

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (run d2017d1f), `om-auto-fix-issue` with the repo-local override applied
- **Trigger:** `/om-auto-fix-issue 84` (E06-S02, epic #82)
- **Branch:** `feat/issue-84-person-record-groups-tab`, from `main` at 01bb860
- **Status:** completed, PR open for review.

## Goal

An administrator sees which groups a person was in and when, deep-links a tab of the person record, lands on the guardianship tab after creating a person (F-01), and reads "Account active" with the login e-mail; the Account tab is shown to every reader, "Create account" only with `people.accounts.manage` (README B-10).

## Steps

1. Concurrency check: #84 had no assignee, no `in-progress` label, no claim comment and no PR. Claimed it (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Classification: feature. Spec gate: no spec covers it — the UX parity spec lists #84 as a non-goal ("its own story, built on the existing memberships API") and the club spec phase 2 step 2 deferred the tab until `groups` existed. Took the direct route, as #100 did: UI over existing scoped reads plus two additive response fields; no module, dependency, migration or breaking contract. The club spec gets a changelog row and its deferral note is marked implemented.
3. Implemented (see *Files*), updated J-001, E02-S02 and TEST-006 to the new redirect URL and the "Account active" text, added the E06-S02 integration test.
4. `yarn verify`; fixed the `lessons:check` failure (two catalog rows from `main` out of file-name order, swapped).
5. Focused integration runs: E06-S02 (fixed a test mistake after the first run, see the lesson), then E02-S02, TEST-006 and J-001 one id per run.

## Decisions

- **Groups tab as an injection spot.** `people` renders `vereino:people:person-record:groups`; `groups` registers `groups.injection.person-groups` (feature `groups.view`). The tab trigger is shown only when `useInjectionWidgets` returns a widget for the user, so `people` never imports `groups` and a user without `groups.view` sees no empty tab.
- **Group and section names on the membership rows**, added by the memberships route's `afterList` (`groupSummaries` in `groups/services/groups-read.ts`): one extra read per page instead of the widget fetching the whole group list. Additive response field `group`; the rows are already limited to the readable groups, so a coordinator sees only their sections' memberships (AC 6) by construction.
- **Login e-mail** comes from the platform user (`accountEmail` in `foundation/services/accounts.ts`, tenant and organization checked, null otherwise), not from the person's contact e-mail, which can differ. Only the full person view carries it; a coordinator's basic view shows the status without the address.
- **`?tab=`** follows the section page of #85 (`tabFrom` + `router.replace`); an unknown or hidden tab falls back to Details.
- `people.account.exists` ("This person has an account.") is replaced by `people.account.active` ("Account active") and `people.account.login` ("Login: {email}"), from the mockup's `b.screenPerson.accountActive`.

## Files

- `packages/app/src/modules/groups/`: `services/groups-read.ts` (`groupSummaries`), `api/memberships/route.ts`, `api/shared.ts` (schema + type), `components/client-helpers.ts`, `widgets/injection-table.ts`, `widgets/injection/person-groups/widget.ts` + `widget.client.tsx`, `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/src/modules/people/`: `components/PersonRecord.tsx`, `components/PersonForm.tsx`, `components/AccountPanel.tsx`, `components/client-helpers.ts`, `api/persons/[id]/route.ts`, `api/shared.ts`, `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/src/modules/foundation/`: `services/accounts.ts` (`accountEmail`), `index.ts`, `README.md`
- Tests: `packages/app/.ai/qa/tests/people/E06-S02-person-record-tabs.spec.ts` (new); `journeys/J-001-club-structure-and-family.spec.ts`, `people/E02-S02-person-records.spec.ts`, `people/TEST-006-person-record-and-member-pages.spec.ts` (updated)
- `.ai/specs/2026-10-20-vereino-club-management.md` (deferral note, changelog row)
- `.ai/lessons/sign-in-browser-ends-the-api-token.md` (new) and `.ai/lessons.md` (its row; two existing rows re-sorted)

## Commands and results

- `yarn verify` (first run): `generate`, `typecheck`, `typecheck:packages`, `typecheck:qa`, `lint`, `format:check`, `ds:check`, `i18n:check-hardcoded`, `contracts:check` passed; `lessons:check` failed verbatim: `.ai/lessons.md: lessons/claim-belongs-to-the-run-not-the-account.md must come before lessons/db-generate-varchar-length-and-concurrent-index-migrations.md (rows sorted by file name)` (rows already on `main`). After the swap, `yarn verify --from lessons:check`: `lessons:check`, `test`, `test:scripts`, `build` passed.
- After the later edits (test, READMEs, spec, lesson): `yarn format:check` 0 unformatted, `yarn typecheck:qa` exit 0, `node scripts/check-lessons.mjs` valid.
- `yarn test:integration:vereino --filter E06-S02`, first run: failed at the account creation, `Error: {"error":"Unauthorized"} … Expected: 201 Received: 401` — `signInBrowser` had reset the administrator's password, ending the API token. The test now fetches a fresh token; rerun: **1 passed (9.3 min)**.
- `--filter E02-S02`: 6 passed (4.4 min); `--filter TEST-006`: 2 passed (2.4 min); `--filter J-001`: 1 passed (3.0 min).

## Lessons

- New: `sign-in-browser-ends-the-api-token`.

## Open problems

- The Groups tab lists at most 100 memberships (one page); no person comes near that today.
- The whole integration suite was not run; only the four affected tests.
