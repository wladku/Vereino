# Issue #25 — club structure: settings, sections, places, institutions (club spec phase 1 step 2)

- **Date:** 2026-10-28
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` procedure (feature route; the skill was read from the repository because it is not installed in the session) with one implementation subagent and the coordinator's own review and gate
- **Trigger:** product owner — "/om-auto-fix-issue 21"; #21 is the E02 epic, so the owner chose "Najpierw #25"; Ask First: migrations approved ("Tak, generuj"); base: stacked on PR #48
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 1 step 2 (DD-02, DD-37, TEST-001, TEST-032); issue #25 (epic #21); branch `feat/issue-25-club-structure` on `feat/issue-38-staff-accounts-roles`
- **Status:** completed — PR open for review, based on #48's branch

## Goal

Let the club administrator set up the club: the D22 settings with their defaults, sections with coordinators (a section without one is flagged, not blocked), the place hierarchy and the institutions — on the foundation kernel and the minimal `club_core` / `people` of #48.

## Steps

1. Read #21 and its stories; asked the owner which part of the epic to build, whether to generate migrations, and the base branch.
2. Claimed #25 (assignee, `in-progress`, 🤖 comment); worktree from #48's branch; `yarn install`.
3. Subagent: DD-37 settings (entity columns, typed defaults, `/backend/club/settings`); `Section`, `Place`, `Institution` with undoable commands through `authorizeScoped`, CRUD routes, pages, en/pl catalogs; the `people.section-coordinators` response enricher; the place cycle rule (422) under a per-club advisory lock and the leaf rule as `clubCorePlaces.assertBookableLeaf`; encrypted institution and place contacts; migration from `yarn db:generate` against a throwaway Postgres with `lock_timeout` and a hand-written `down()`; integration tests TEST-001, TEST-032 (coordinator part) and the #25 acceptance criteria.
4. Coordinator review of the diff (module direction of the enricher, the ESLint change, the migration, the cycle check); `yarn verify` and the full integration suite rerun; spec note, TEST-001 wording, lesson and this log.

## Decisions

- Coordinators come from `people` through a response enricher on `club_core:section` (`_people.coordinators`, `_people.coordinatorMissing`): `people` requires `club_core`, never the reverse. "Missing" = an active section without a coordinator active today.
- Place cycle → 422 `place_hierarchy_cycle` (glossary *Place*); TEST-001's "409 on a cycle" corrected in the spec.
- Rules added where the spec was silent: 409 `place_has_children`, 409 `institution_in_use`, 422 `place_reference_invalid`.
- Read scope: sections for the club administrator and the coordinator of the section; places, institutions and settings for the club administrator only; every write club administrator only. Role features come from the catalogue `people` already seeds.
- `orderSalesDocument` accepts only `none` in 1.0; `surface` is free text (no dictionaries module); no `search.ts` (the spec lists no searchable `club_core` entity).
- An operator CLI `club_core check-bookable-place` exercises the leaf rule against the real service in the integration test, until phases 2 and 5 call it.

## Installed behaviour that differed from the spec

- Encrypted fields decrypt to strings and are never parsed back (`tenantDataEncryptionService.ts`), so `club_core_places.contacts` is encrypted `text` holding JSON.
- `makeCrudRoute` checks the optimistic-lock token before the command, so a stale token answers 409 before body validation (lesson).
- `pageContext: 'settings'` belongs in `page.meta.ts`, not on `CrudForm`.
- The first `.tsx` of a Vereino module crashed ESLint (`Cannot redefine plugin "jsx-a11y"`); `packages/app/eslint.config.mjs` passes only the recommended rules (lesson).
- `DataTable`'s `LegacyColumnDef` is deprecated; the tables type columns as `DataTableProps<T>['columns']`.

## Files changed

- `packages/app/src/modules/club_core/**` — entities, migration, commands, routes, services, DI, CLI, events, pages, components, i18n, README
- `packages/app/src/modules/people/{data/enrichers.ts,lib/people-rules.ts,services/club-clock.ts,README.md}` — coordinators enricher
- `packages/app/eslint.config.mjs` — `jsx-a11y` rules without the plugin object
- `packages/app/.ai/qa/tests/{_fixtures/club-structure.ts,club_core/**}` — integration tests
- `.ai/specs/2026-10-20-vereino-club-management.md` — step 2 note, TEST-001 wording, changelog
- `.ai/lessons.md`, `.ai/lessons/eslint-jsx-a11y-and-stale-lock-before-validation.md` — lesson
- `.ai/runs/2026-10-28-issue-25-club-structure.md` — this log

## Commands and results

- `yarn verify` — 13/13 passed (subagent run and coordinator rerun).
- `yarn test:integration:vereino` (whole suite) — 21/21 passed: TEST-001 (settings, sections, institutions, places), TEST-032, the four E02-S01 cases, and every #38 test. One earlier failure (TEST-001 places, 400 expected, 409 received) was a test sending another record's lock token; fixed in the test.
- `yarn db:generate` against a throwaway Postgres only; a second run reported no changes. No `yarn db:migrate`.

## Open problems

- The pages were not checked in a browser at 375 px and in dark mode (the epic's phase 1 exit gate; the QA gate is off for this run).
- Deferred to their consumers: section deletion and deactivation with groups (phase 2), place rules about sessions and bookings (phases 2 and 5), contracts (A05), public fields and logos (steps 6–7), option-source routes.
- A request without the optimistic-lock token is still not rejected with 400 (foundation-wide, see the #38 run log).

## Next steps

- Merge #48, retarget this PR to `main`, owner review; then #26.

## Lessons recorded

- `.ai/lessons/eslint-jsx-a11y-and-stale-lock-before-validation.md`
