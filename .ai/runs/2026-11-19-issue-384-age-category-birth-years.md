# Run: issue #384 — age categories carry their PZPN birth years (E13-S12, phase L12)

- **Goal and trigger:** Cezar run (task 2cf6ea69) started by the `cezar` label on #384; `om-auto-fix-issue` with the vereino override, feature route.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md` phase L12 (REQ-L16, DD-L17, J-L10, TEST-L23, AC-L16, Q-L25, Q-L26) · #384 (epic #255) · `feat/issue-384-age-category-birth-years`.
- **Readiness:** the spec is `Ready for implementation`; Ask First item 15 (migration E, the routes, `age_range_inverted`) approved by the owner on 2026-11-19 and recorded by PR #418 (on `main`); phase L12 depends on nothing.

## Steps

1. Claimed #384 (assignee, `in-progress`, `🤖` claim comment naming the worktree, branch and start time).
2. Rules: `PZPN_AGE_CATEGORIES` carries each default's `range`; `ageCategoryRangeInverted`, `referenceYear`, `birthYearsOf`, `fitsAgeCategory`, `proposedAgeRange`, `shouldProposeAgeRange`, `formatBirthYears`, `parseUInput` in `groups/lib/groups-rules.ts`, 100 % covered; error codes `age_range_inverted`, `age_category_name_taken`, `age_categories_missing`.
3. Data: entity `AgeCategoryRange` (`groups_age_category_ranges`, partial unique index on organization + entry); migration E generated with `yarn db:generate` (snapshot kept in its Prettier style) plus a hand-written seed for existing clubs' entries with the default values; `seedAgeCategoryDictionary` seeds the ranges for new clubs and the CLI.
4. Commands `groups.age_category_ranges.set` (undoable; the range's `updatedAt` as the lock token, none needed for a first range) and `groups.age_categories.create` (entry + range in one transaction); routes `GET/POST /api/groups/age-categories`, `PUT /api/groups/age-categories/{entryId}/range`.
5. UI: tab **Age categories** after Seasons (`AgeCategoriesTable.tsx`: season select, inline range editor for `dictionaries.manage`, add dialog, link to the dictionary page, read-only otherwise); birth-year hint under the category on the team form (`AgeCategoryHint.tsx`); the proposal and "Rocznik … w sezonie …" on the public tab; `en`/`pl` keys; module README.
6. TEST-L23 (`packages/app/.ai/qa/tests/groups/TEST-L23-age-category-birth-years.spec.ts`).

## Decisions

- **Create not undoable.** The platform hard-deletes dictionary entries and its own entry commands own their undo; the new category is removed on the dictionary page. The range set is undoable.
- **Cache flush.** The create writes the `DictionaryEntry` past the platform command, so its log carries `cacheAliases: ['dictionaries.entry']` and the bus flushes the platform's cached entry list (verified in TEST-L23: the platform entries route lists the new category at once).
- **Two extra codes** within the spec's error rows: `age_category_name_taken` (409 "a category with that name exists") and `age_categories_missing` (422, no active dictionary). The GET adds `season` and each item's `updatedAt` (lock token).
- **Write grant.** Routes need `dictionaries.manage` (the platform page's feature) and the commands the `club_admin` grant, so a coordinator gets 403 either way.
- **Out of scope** (issue): the roster's "Fits" filter (#383) and class groups.

## Files changed

`packages/app/src/modules/groups/{lib/groups-rules.ts,lib/error-codes.ts,lib/__tests__/groups-rules.test.ts,data/entities.ts,data/validators.ts,services/age-categories.ts,commands/age-categories.ts,api/age-categories/route.ts,api/age-categories/[entryId]/range/route.ts,migrations/Migration20261119190738_groups.ts,migrations/.snapshot-open-mercato.json,backend/groups/age-categories/page.tsx,backend/groups/age-categories/page.meta.ts,components/AgeCategoriesTable.tsx,components/AgeCategoryHint.tsx,components/GroupsNav.tsx,components/GroupForm.tsx,components/GroupPublicForm.tsx,components/client-helpers.ts,i18n/en.json,i18n/pl.json,README.md}`, TEST-L23, the spec changelog entry `2026-11-19-issue-384-phase-l12.md`, lesson `orm-created-row-has-no-id-before-flush`, this log.

## Commands and results

- `yarn db:generate` — `groups: generated Migration20261119190738_groups.ts`; snapshot re-formatted with Prettier (diff only adds the table).
- Migration SQL on a throwaway `postgres:17` container: up seeded the renamed default `orlik` (10–11) and `senior` (20–open), skipped a custom entry and another dictionary's `orlik`; down, then up again, clean.
- `jest src/modules/groups/lib` — 5 suites, 76 tests pass; `groups-rules.ts` and `error-codes.ts` 100/100/100/100.
- `yarn generate`, `yarn typecheck` — exit 0.
- `yarn test:integration:vereino --filter TEST-L23`, first run: `yarn initialize` failed — `Value for AgeCategoryRange.entryId is required, 'undefined' found` (the seeded `DictionaryEntry` gets its id from the database default only at the flush). Fixed with an explicit `randomUUID()`; lesson recorded.
- Second run: **1 passed** (18.9 s) — API contract, 422/403/400/404/409, tenant isolation, undo, rename, the public tab proposal 9–10 with "2017"/"2026/27", the read-only tab for the coordinator, the administrator's inline edit, axe light/dark, no overflow at 375 px.
- `yarn verify`, first run: failed at `lint` (7 errors in `AgeCategoriesTable.tsx`: void arrow shorthands and a state reset in an effect; 1 in TEST-L23: a redundant `String()`). Fixed (the add dialog now remounts by key); `yarn verify --from lint`: all remaining steps pass (generate, typecheck, typecheck:packages, typecheck:qa passed in the first run).
- Third TEST-L23 run after the lint fix: **1 passed** (47.4 s).

## Open problems / next steps

- AC-L16 stays unticked until #383 lands the "Fits" filter that uses these ranges.

## Review (PR #424)

An independent reviewer read the diff (no blockers). Fixed: the hint's query key now includes the organization scope version; the OpenAPI request bodies reuse the validators (1–99 bounds). Kept, with reasons in the PR: the public tab fills the proposed ages into empty fields (Q-L26, J-L10 step 3 "she keeps it"; editable, never over a stored value); the create writes the dictionary entry directly so entry and range share one transaction, as the spec requires (the platform command runs its own transaction; the seed already writes entries this way). Left: the edit UI shows for `dictionaries.manage` without the `club_admin` grant (outside the role catalogue only; the server answers 403). After the fixes: `yarn typecheck` exit 0, eslint clean on the touched files, TEST-L23 **1 passed** (44.2 s).

## CI fix (PR #424, cezar task 53688008)

- **Trigger:** required checks `integration` and `integration (shard 4/6)` failed on run 44598744007.
- **Cause:** `E06-S08-groups-filters-and-counts.spec.ts:134` asserted the groups nav tabs as exactly Groups / External teams / Seasons; this PR adds the **Age categories** tab after Seasons (REQ-L16), so the list had a fourth entry (`+ "Age categories"`, failed on the retry too). Not a flake and not a product bug: the test's expectation was out of date.
- **Fix:** the assertion now lists the fourth tab through `uiText('groups.nav.tabs.ageCategories', { exact: true })`. `integration` is the aggregate job and follows the shard.
- **Local check:** `yarn test:integration:vereino --filter E06-S08` — **1 passed** (14.9 s); `yarn typecheck:qa` exit 0; `yarn qa-texts:check` 0 problems.
- **Base:** merged `origin/main` (no conflicts) on a detached HEAD at the PR head; pushed with `git push origin HEAD:feat/issue-384-age-category-birth-years`.
