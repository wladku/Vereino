# Run: issue #798 — E26-S02 places and settings for section sign-ups (phase 1)

- **Goal and trigger:** cezar task (om-auto-fix-issue) for issue #798: build phase 1 of `.ai/specs/2026-11-25-vereino-section-sign-up-form.md` (D-041) — group places and the settings the sign-up form will use; nothing public yet.
- **Spec / issue / branch:** spec phase 1 (REQ-J01, REQ-J02, TEST-J01, AC-J01); issue #798 (epic #787); branch `feat/issue-798-places-and-settings`.
- **Approvals:** Ask First items of phase 1 approved by the owner on #788 (2026-11-26, comment 7183799608) and restated on #798: the three migrations, the fit rule in `@vereino/core`, the `groups.applicationTargets` contract; Q-J01…Q-J10 take the recommended defaults.

## Steps

1. Claimed #798 (assignee, `in-progress`, `🤖` claim comment naming the worktree and branch).
2. Moved the age fit rule (`AgeCategoryRange`, `referenceYear`, `birthYearsOf`, `fitsAgeCategory`, `fitsAgeRange`, `FitRule`, `fitRuleOf`, `fitsRule`) to `packages/core/src/age-fit.ts` with `node --test` tests at 100 %; `groups/lib/groups-rules.ts` re-exports them, so every caller keeps its import (DD-J04).
3. `groups`: `places_limit` (1–500, check constraint) and `accepts_applications` (default true) on the entity, validators, create/update/undo snapshots, season rollover copy, list and detail API (+ `participantCount` on the detail); fields on the "Public page" tab; "Places: x / limit" on the group record header and the member group page, "x / limit" in the groups list column and the member group cards; pure helpers `parsePlacesLimitInput`, `placesText`, `isGroupFull`.
4. `groups.applicationTargets` DI contract (`services/application-targets.ts`, pure shaping in `lib/application-targets.ts`): the section's live groups with the fit rule on a date (reference year of the club season containing the date), the limit, `occupied` (distinct participants active on the date) and the switches; `lockGroupId` + caller `em` row-locks the group first (DD-J10a).
5. `club_core`: `club_core_sections.accepts_applications` (default false) through `PUT /api/club_core/sections/{id}/public`, its form field behind `SECTION_APPLICATIONS_SWITCH_SHOWN = false` (phase 2 release rule); club settings `applicationAgeReferenceDay` (`MM-DD`, default `09-01`), `applicationAnswerDays` (1–60, default 7, check constraint) and `applicationInformation` (≤ 6000, null = built-in text) as settings keys, with the B-J2 fields on `/backend/club/settings` (day + month selects, answer days, the information textarea at the end of the consent texts group).
6. `yarn db:generate` → `Migration20261126061659_club_core.ts`, `Migration20261126061659_groups.ts`; snapshots kept in Prettier style (lesson `db-generate-snapshot-style-and-public-block-scope`); a second `db:generate` reports no changes.
7. i18n en/pl; module READMEs; spec changelog file `2026-11-26-issue-798-phase-1.md`.
8. TEST-J01 (`packages/app/.ai/qa/tests/groups/TEST-J01-places-and-settings.spec.ts`).

## Decisions

- **29 February is refused as a reference day**: DD-J03 takes "the latest occurrence" of the day, which a leap day lacks in most years; `monthDayOf` caps February at 28.
- **`seasonEndsOn` of an application target** is the end of the club season that contains the date (DD-J03/DD-J14 take the season from the reference date, never the group's ending season); `seasonId` stays the group's own season.
- **"x / limit" counts distinct active participants** (the existing `participantCount` of the roster summary); coaches and assistants take no place.
- **Database check constraints** back the two numeric ranges, following `former_participant_retention_months`.
- The section form field stays hidden by a constant in `lib/publication.ts`, so phase 3 flips one line; the panel never sends the hidden value, so a stored switch is kept.

## Files changed

See the PR diff: `packages/core/src/age-fit.ts` (+ test, index), `groups` (entity, validators, commands, API, components, DI, lib, i18n, migration, README), `club_core` (entity, validators, commands, API, settings lib + tests, settings form, section public panel, i18n, migration, README), QA fixtures `groups.ts`, `publication.ts`, TEST-J01.

## Commands and results

- `yarn workspace @vereino/core test` — pass, 100 % lines/branches/functions (age-fit.ts 100 %).
- `jest src/modules/groups/lib src/modules/club_core/lib/__tests__/settings.test.ts` — 9 suites, 111 tests pass.
- `yarn typecheck` — exit 0.
- `yarn db:generate` (second run) — `club_core: no changes`, `groups: no changes`.
- `yarn test:integration:vereino --filter TEST-J01`:
  - run 1 — failed at the 8-minute timeout: `page.locator('[data-crud-field-id="acceptsApplications"] input[type="checkbox"]').uncheck()` waited on the aria-hidden native input (the CrudForm checkbox is a button with the checkbox role). The API part had passed. Fixed: `getByRole('checkbox', { name })`.
  - run 2 (`--no-build`) — failed: `Error: {"error":"Unauthorized"}`, `Expected: 200, Received: 401` at `groupDetail` right after `signInBrowser`: the browser sign-in ended the administrator's API token (lesson `sign-in-browser-ends-the-api-token`). Fixed: `getAuthToken` from the returned password, stored back in `club.adminToken`.
  - run 3 (`--no-build`) — `1 passed (1.2m)`; the test covers 375 px, en and pl, light and dark with axe and no sideways scroll.
- `yarn verify` — first run failed at `lint`: `groups-rules.ts 88:55/88:69 error Invalid type "number" of template literal expression (@typescript-eslint/restrict-template-expressions)` in `placesText`; fixed with `String(…)`; `yarn verify --from lint` passed, then a full `yarn verify` — `all 23 step(s) passed`.
- `yarn guard` — no blocking findings.
- Not run: a raw up/down/up of the two migrations against a throwaway database. The SQL is generator output (additive columns and two check constraints); `up` ran in the Testcontainers database of every integration run.

## Open problems / next steps

- Phase 2 (E26-S03): the module `enrolment` reads `groups.applicationTargets`, renders the "Apply" button (the button check of TEST-J01) and adds the built-in information text of Q-J09; phase 3 sets `SECTION_APPLICATIONS_SWITCH_SHOWN` to true.
- No new lesson: both test failures were existing lessons (`sign-in-browser-ends-the-api-token`, CrudForm checkbox role), applied here.
