# Issue #88: dashboard widget "Sections without a coordinator"

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5) under cezar, `om-auto-fix-issue` with the repo-local override applied (feature route; the covering spec is the club management spec, so no spec PR)
- **Trigger:** `/om-auto-fix-issue 88` (E06-S06, epic #82)
- **Branch:** `feat/issue-88-dashboard-sections-without-coordinator`, from `main` at 26bda24
- **Status:** completed, PR open for review.

## Goal

The club administrator sees on the panel dashboard (README B-01, note 4) how many active sections have no active coordinator, with up to five of them, each linking to `/backend/club/sections/{id}/edit?tab=coordinators`; per-widget loading, empty and error ("Try again") states; not offered without `club_core.manage`. The widget sets the pattern for the session, payments and facilities widgets.

## Steps

1. Claimed #88 (assignee, `in-progress`, claim comment naming this run's worktree and branch); renamed the task branch. Spec gate: the club spec already covers the widget (glossary *Section*: "active section without a coordinator → warning on the section list and in the administrator widget"; `dashboards` reuse row; `widgets/dashboard/**` extension point), so it was implemented directly, as #93 was.
2. Pure rules `people/lib/dashboard-rules.ts` (keep the flagged active rows, count and first five by name, page query, next-page check, the Coordinators-tab link) with unit tests at 100 %.
3. Widget `people/widgets/dashboard/sections-without-coordinator/` (`widget.ts`, `widget.client.tsx`), id `people.dashboard.sectionsWithoutCoordinator`, features `dashboards.view`, `club_core.manage`, `people.view`, `defaultEnabled`. Title and description come from the catalogs through the dashboard's `<module>.dashboard.widgets.<name>.title` lookup; en + pl.
4. `@vereino/core` role catalogue: `vereino_club_admin` gains `dashboards.view` (it had no dashboard access at all); unit test extended.
5. `yarn generate` (widget registered in `dashboard-widgets.generated.ts`).
6. Integration test `people/E06-S06-dashboard-sections-without-coordinator.spec.ts`.
7. Docs: club spec (permission table row, navigation table row, changelog), `people/README.md`.

## Decisions

- **Owner `people`, not `club_core`:** the coordinator data is the `people.section-coordinators` enricher, and `people` already requires `club_core`; the widget reads the existing list route, so no new API, schema or migration.
- **Data source:** `GET /api/club_core/sections?isActive=true&pageSize=100`, every page, filtered by `_people.coordinatorMissing`. A club has a handful of sections, so a dedicated count route is not worth a new contract; the widget is the pattern for later ones (read a list that already carries the data, reduce it in `lib/`, link each row to where it is fixed).
- **Gate:** `club_core.manage` (assigning coordinators is the administrator's task) plus `people.view` (without it the enrichment is absent and every section would look fine).
- **`dashboards.view` on `vereino_club_admin`:** required for the AC "the administrator opens `/backend`"; additive. Existing tenants get it with `mercato seed:defaults` or `people bootstrap-admin` (the role ACL merge). A tenant whose platform `admin`/`employee` roles already carry a dashboard widget allow-list must add the widget there (noted in the README).
- **Errors stay inside the widget:** `useQuery` with `retry: false`, its own `ErrorMessage` with "Try again"; a 403 does not trigger the platform redirect (`OWN_FORBIDDEN_STATE`).
- **Axe:** the dashboard's AppShell breadcrumb renders `<span aria-current="page" aria-label="Dashboard">` (`aria-prohibited-attr`, platform `@open-mercato/ui` 0.9.0). Added to the platform baseline by node (`data-slot="breadcrumb-page"`), lesson updated.

## Commands and results

- `yarn workspace @vereino/app jest … src/modules/people/lib`: `dashboard-rules.ts` 100 % lines, branches, functions.
- `yarn workspace @vereino/core test`: passed, 100 %.
- `yarn typecheck`, `yarn typecheck:qa`: passed.
- `yarn test:integration:vereino --filter E06-S06`, first run: every functional step passed (layout offers the widget to the administrator and not to a `dashboards.view` + `club_core.view` + `people.view` user; count 2 with both names and links; the row opens `?tab=coordinators`; a 500 from the sections route shows the error and "Try again", the retry recovers; the empty text after assigning coordinators; 375 px without overflow), then failed on `expect(violations).toEqual({})`: `aria-prohibited-attr` (serious, 1 node) in light and dark — the platform breadcrumb above.
- Second run after the baseline entry: 1 passed.
- `yarn verify`, first run: failed at `lint` — the strict React rules (`react-hooks/refs`: "Cannot update ref during render"; `react-hooks/set-state-in-effect`: "Calling setState synchronously within an effect") on the widget's hand-written loader. Rewritten on `useQuery` (`retry: false`, the refresh token in the key, `refetch` for "Try again"), as `SectionsTable` loads.
- `yarn test:integration:vereino --filter E06-S06` on the `useQuery` version: 1 passed (1.7 m).
- `yarn verify` on the final tree: all 13 steps passed.

## Lessons

- Updated: `platform-crudform-labels-axe-baseline` (the breadcrumb node).

## Open problems / next steps

- The next widgets (E06-S13, E07, E08) follow this pattern in their own modules.
