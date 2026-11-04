# 2026-11-04: Issue #83 — people list filters, perspectives, roles, groups and guardians

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5), cezar task, `om-auto-fix-issue` (feature route → implementation of an existing spec)
- **Trigger:** `om-auto-fix-issue 83` (E06-S01).
- **Spec:** `.ai/specs/2026-11-03-vereino-ux-parity-phases-1-3.md`, phase 1 (REQ-U01); status line updated (phases 1 and 2 implemented), AC-U01 and AC-U02 ticked, V-U01 resolved, Changelog row added.
- **Branch:** `feat/issue-83-people-list-filters`
- **Status:** see *Commands and results*; PR opened at the end of the run.

## Approvals on record

- The spec is `Ready for implementation` (owner's go, 2026-11-03). Phase 1 adds no migration, module or dependency, so no Ask First item applies. The issue comment of 2026-11-03 records the age filter as a range plus the Children perspective (Q-U03, Q-U11), which this run implements.

## Steps

1. Claimed #83 (assignee, `in-progress`, claim comment) and renamed the task branch. Feature with a covering, ready spec: straight to phase 1.
2. **Pure logic** `people/lib/person-list-filters.ts` (+ unit tests, 100 %): age range → birth-date bounds (club date, 29 February), `view` → plan, id-set intersection, role badges, URL ↔ page state, "Last First".
3. **Contract** `people/services/person-filter.ts` (`groups.personFilter`, read with `hasRegistration`); `people/services/person-list.ts` resolves the own predicates (role assignments, guardianships, the name search through `findEntityIdsBySearchTokens`) and the own columns.
4. **Route** `people/api/persons/route.ts`: new query parameters, ids ANDed with the record scope (never widened), 422 above 10 000 ids, 400/503 for an absent/failing contract, `afterList` adds `age`, `roles`, `hasWards`, `guardians` (a guardian named only when readable by the caller), `enrichers: { entityId }`.
5. **groups**: `groups/services/person-filter.ts` registered in `groups/di.ts`; enricher `groups.person-groups` adds `_groups.groups`.
6. **UI** `PersonsTable.tsx`: perspective tablist with the table as its tab panel, filters (section and group only when `groups` answers), search, page — all in the URL (push for filters/tabs/pages, replace while typing); columns age, roles, groups, account, guardians; empty and filtered-empty states. en/pl keys.
7. **Tests**: TEST-U01, TEST-U02, TEST-U03 (`people/E06-S01-people-list-filters.spec.ts`), TEST-U04 (`people/E06-S01-people-list-page.spec.ts`); the messaging probe gained a `routeGet` op so TEST-U03 runs the real route with the token hidden.

## Decisions

- Own columns in `afterList`, not `transformItem` (synchronous per row); `age` computed on the server with the club date.
- `ageFrom > ageTo` → 400 `people_filter_age_range` in the route: a `.refine` on the list schema crashed the OpenAPI factory (lesson `crud-list-schema-no-refine`).
- Guardian names only for guardians the caller may read (fail closed).
- Tablist above `DataTable` (its `toolbar` prop replaces the filter bar); columns do not hide under 640 px because `DataTable` scrolls horizontally instead.
- A narrowed empty list uses the platform's `filterAwareEmptyState` (see run 4).
- A search term with no word of 3+ characters falls back to the last-name `$ilike` path (the token index is not consulted).
- All recorded in the spec Changelog.

## Commands and results

- `npx jest src/modules/people/lib/__tests__/person-list-filters.test.ts --coverage`: 26 passed; `person-list-filters.ts` 100 % statements, branches, functions, lines (one test of a year below 1000 removed: `isCalendarDate` rejects such years and ages are capped at 120).
- `yarn typecheck`, `yarn typecheck:qa`: clean. `npx eslint` on the changed areas: clean after fixing 9 errors (void-returning arrow shorthands, `setState` in an effect → adopted during render, two unnecessary casts).
- `yarn test:integration:vereino --filter E06-S01-people-list`:
  - run 1: all 4 failed — `yarn initialize` died with `Cannot overwrite keys on object schemas containing refinements` (the `.refine`), so `POST /api/people/persons` answered 500. Fixed.
  - run 2: TEST-U01 and TEST-U02 passed; TEST-U03 failed `Cannot find package 'zod' imported from …\vereino-probe-queue-…\routes\…mjs` (bundle written outside the app root); TEST-U04 failed axe `aria-valid-attr-value` (critical, 1 node: the selected tab's `aria-controls` pointed at no panel). Both fixed (bundle under `node_modules/.cache/vereino-probe`, the table rendered in a `TabsContent`).
  - run 3: TEST-U01, TEST-U02, TEST-U03 passed (3 passed, 8.2 min); TEST-U04 failed on the test itself — `getByRole('row').filter({ hasText: 'Kowalska Kasia' })` also matched Jan's row, which names Kasia in its Guardians column. Rows are now matched by their name cell.
  - run 4 (`--filter E06-S01-people-list-page`): failed at the filtered-empty step — `DataTable` rendered its own "No results found" for the search, never the app's "No people match". The page now passes the platform's `filterAwareEmptyState` (+ `withoutLastFilter`, `canRemoveLastFilter`, unit-tested, 29 tests, 100 %).
  - run 5 (`--filter E06-S01-people-list-page`): TEST-U04 1 passed (1.7 min) — tabs with arrow keys, URL restore on reload, back button, columns, filter-aware empty state, search, axe clean (light, platform baseline), no overflow at 320 px, 375 px dark mode. The route has not changed since run 3, where TEST-U01…U03 passed.
- `yarn verify`: see below.

## Open problems

- The unfiltered empty state is not exercised end to end: a club always holds its administrator's person.

## Next steps

- Phase 3 (#86) stays open.
