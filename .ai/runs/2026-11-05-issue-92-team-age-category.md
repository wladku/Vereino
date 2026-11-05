# A team's PZPN age category from the club dictionary (#92, E06-S10)

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (feature route), cezar worktree `250c8a78`
- **Trigger:** cezar task "92"; the owner approved enabling `dictionaries` and its migrations on 2026-11-04 (D-030, issue comment; the decision record is on PR #158, not merged yet).
- **Issue / spec / branch:** #92; `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 steps 1–2 (REQ-019, AC-019, TEST-030); `feat/issue-92-team-age-category` from `main` at 75d999a
- **Status:** completed; PR open for review.

## Goal

A coordinator gives a `team` its PZPN age category from a club dictionary the administrator edits; the groups list (B-11) gets a Category column and filter, the group form and record (B-12) show it; a category on a class group answers 422 `group_team_fields_on_class_group`.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no PR closing #92 (#158 only mentions it). Classified as a feature (label `feature`); FR triage: nothing built (`age_category_entry_id` deferred in the spec and the groups README), the covering spec exists, so the work continues on it without a new spec. Claimed the issue (assignee, `in-progress`, `🤖` comment).
2. Read the installed `dictionaries` module (0.9.0): entities `Dictionary` / `DictionaryEntry` (entries hard-deleted, no `deleted_at`), routes need `dictionaries.view` / `.manage`, the config page needs both, sort modes, `isSystem` blocks deleting the dictionary only.
3. Enabled `dictionaries` in `src/modules.ts`; `groups` `requires` it. `vereino_club_admin` gets `dictionaries.*` (role catalogue in `@vereino/core`, test extended); coordinators and coaches get no `dictionaries` feature.
4. `Group.ageCategoryEntryId` (nullable uuid, team-only: added to `TEAM_FIELDS`), validators (create, update, list filter), commands (snapshot, restore, shape check: an id outside the club's active dictionary → 422 `groups_reference_invalid`, `field: ageCategoryEntryId`; undo of old snapshots without the field reads null).
5. `services/age-categories.ts`: list, membership check, names by id, and the idempotent seed (dictionary `groups.age_categories`, eight PZPN entries, `created_at_asc`, created only when missing). `setup.ts` `seedDefaults` calls the seed; `cli.ts` adds `yarn mercato groups seed-age-categories --tenant --org` for clubs set up earlier and for the tests (test clubs do not run `seedDefaults`).
6. Routes: `GET /api/groups/options/age-categories` (`groups.view`); the list adds `ageCategoryEntryId`, `ageCategoryName` and the filter; the detail adds both fields.
7. UI: the form's team group gets an "Age category" select (cleared for a class group); the list a Category column and filter kept in the URL (`lib/group-list.ts` state, tests extended); the read-only record shows the category.
8. Migration `Migration20261105091137_groups` from `yarn db:generate` (offline, from the module snapshot): one nullable column with `lock_timeout`; a second `db:generate` reports no changes. No index (see *Decisions*).
9. Integration test `groups/E06-S10-team-age-category.spec.ts` (API, scope, 422s, the administrator adding an entry through the platform API, the browser at 375 px); TEST-030's header now points to it.
10. Spec (step 1 and step 2 notes, option-source line, AC-019 ticked, Changelog row) and the groups README updated.

## Decisions

- **Own options route instead of the platform selector.** The spec said "the shared `dictionaries` selector"; that control stores the entry `value` and needs `dictionaries.view` (inline create needs `.manage`). The column stores the entry id (spec data model), and giving coordinators and coaches `dictionaries.*` would expose every club dictionary. `GET /api/groups/options/age-categories` with `groups.view` follows the `activities` option-route precedent; the spec line is updated.
- **The migration is in #92's approval.** D-030 approves "`dictionaries` and its migrations" for #92, and the issue's scope (the team form's field) needs the column; the issue's risk comment names "a migration". The PR says so for the reviewer.
- **No index on the new column**: filtering runs on one organization's few groups, already narrowed by `groups_groups_tenant_org_idx`; an index on an existing table would need its own concurrent migration (BACKWARD_COMPATIBILITY §5).
- **Seed once, never re-add**: the seed creates the dictionary with its entries only when the club has none, so an entry the administrator removed never comes back.
- **Entries the platform deletes**: the group keeps the id and shows no category; the write check only runs when the category changes, so other edits of such a group still save.
- **PZPN labels** carry the age groups ("Orlik (U10–U11)"); the dictionary is data the administrator may rename.

## Files changed

- `packages/app/src/modules.ts`; `packages/core/src/roles.ts`, `packages/core/src/__tests__/roles.test.mjs`
- `packages/app/src/modules/groups/`: `index.ts`, `setup.ts` (new), `cli.ts` (new), `data/entities.ts`, `data/validators.ts`, `lib/groups-rules.ts`, `lib/group-list.ts` (+ tests), `services/age-categories.ts` (new), `commands/groups.ts`, `api/shared.ts`, `api/groups/route.ts`, `api/groups/[id]/route.ts`, `api/options/age-categories/route.ts` (new), `components/{client-helpers.ts,GroupForm.tsx,GroupsTable.tsx,GroupRecord.tsx}`, `i18n/{en,pl}.json`, `migrations/Migration20261105091137_groups.ts` (new) + snapshot, `README.md`
- `packages/app/.ai/qa/tests/_fixtures/groups.ts`, `groups/E06-S10-team-age-category.spec.ts` (new), `groups/TEST-030-groups-of-both-kinds.spec.ts` (comment)
- `.ai/specs/2026-10-20-vereino-club-management.md`

## Commands and results

- `yarn generate`: completed. `yarn db:generate`: `groups: generated Migration20261105091137_groups.ts`; re-run after editing: `groups: no changes`.
- `yarn typecheck`, `yarn typecheck:qa`: exit 0.
- `jest src/modules/groups/lib`: 2 suites, 22 tests passed. `yarn workspace @vereino/core test`: 100 % coverage.
- `yarn test:integration:vereino --filter E06-S10`, run 1: failed — `TimeoutError: locator.click: Timeout 30000ms exceeded. waiting for getByRole('option', { name: 'Akademia piłkarska' })` (the trace shows `/api/club_core/sections` answered 200; the combobox was clicked before its options loaded). Fixed with a retrying `pick` helper.
- Run 2 (`--no-build`): failed — `Expected: "Orlik młodszy (U10)" Received: undefined` on the API read after the browser step: `signInBrowser` resets the password and ends the coordinator's earlier token (lesson `db-generate-varchar-length-and-concurrent-index-migrations`, point 4). Fixed with a fresh `getAuthToken`.
- Run 3 (`--no-build`): `1 passed (2.1m)`.
- `yarn test:integration:vereino --filter TEST-030 --no-build`: `2 passed (1.5m)`.
- `yarn verify`: all 13 steps passed (generate, typecheck, typecheck:packages, typecheck:qa, lint, format:check, ds:check, i18n:check-hardcoded, contracts:check, lessons:check, test, test:scripts, build).
- New lesson `integration-clubs-skip-seed-defaults-and-crudform-select-race` (test clubs never run `seedDefaults`; the select race); `node scripts/check-lessons.mjs` valid.

## Open problems

- Clubs initialized before this change have no dictionary until an operator runs `yarn mercato groups seed-age-categories --tenant <id> --org <id>` (no deployment exists yet).
- Role features of existing tenants need `yarn mercato auth sync-role-acls` for `dictionaries.*` on `vereino_club_admin` (ADR-013 pre-deploy step).

## Next steps

- Review and merge the PR; the public page's "age category or level" block (REQ-025) can read `ageCategoryName` when it is built.
