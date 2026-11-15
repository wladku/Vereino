# Run: issue #256 — five admin pages with tabs (E09-S02)

- **Goal and trigger:** unattended cezar run (task f2729190) of `om-auto-fix-issue 256`, queued by the `cezar` label.
- **Issue:** #256 (`feature`, `priority-high`, `risk-medium`), epic #251. **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (phase 2: REQ-N02, DD-N02, TEST-N03, AC-N02, V-N01). **Branch:** `feat/issue-256-admin-tabbed-pages`.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no open PR referencing #256. The issue's blocking question (spec in Draft) was resolved by #317: the spec is `Ready for implementation` with the owner's decisions of 2026-11-15 (A-N03, A-N05 confirmed). Dependency #246 merged. Claimed (assignee, `in-progress`, 🤖 comment).
2. Feature route: the covering spec exists, so phase 2 was implemented directly on this branch.
3. Shared rules in `@vereino/ui` `src/admin/route-tabs-model.ts` (100 % unit coverage, `route-tabs.test.mjs`): visible tabs (wildcard-aware through the platform `hasAllFeatures`; the current tab always stays; unknown grants → only the current tab), the strip rule (two or more visible tabs), the tab-change target (visible tabs only), the `?tab=` alias (fixed list, later tabs only).
4. The strips: `club_core/components/ClubInstitutionsNav.tsx` (+ `ClubRouteTabs.tsx`), `communication/components/ThreadsNav.tsx` (+ `CommunicationRouteTabs.tsx`), `facilities/components/FacilityRulesNav.tsx`, `FacilityRecordsNav.tsx`, `FacilityReportsNav.tsx` (+ `FacilityTabs.tsx`); mounted on the 13 tab routes' `page.tsx` around the existing table or report.
5. Page metadata: every tab route's `pageTitle`/breadcrumb names the page; the eight secondary routes are `navHidden` with a breadcrumb linking to the first route. Route paths and `requireFeatures` unchanged. `yarn generate` run.
6. i18n en/pl: `club_core.institutions.page.title` and `.tabs.*`, `communication.threads.page.title` and `.tabs.*`, `facilities.rules.*`, `facilities.records.title` and `.tabs.*`, `facilities.reports.tabs.*`; texts from the mockup keys.
7. Tests: new `club_core/TEST-N03-pages-with-tabs.spec.ts`; TEST-N01 now expects five Club items (Contracts is a tab).
8. Spec: V-N01 answered, status line notes phase 2; changelog entry `2026-11-15-issue-256-pages-with-tabs.md`.

## Decisions

- **The strip markup lives in the app, the rules in `@vereino/ui`.** A first version put a `RouteTabs` component in `@vereino/ui`; `yarn typecheck:packages` failed because importing `@open-mercato/ui/primitives/tabs` pulls the platform's `tabs.tsx` source into the package's `noUncheckedIndexedAccess` typecheck (`tabs.tsx(153,9): error TS2532`). The pure rules stay shared and tested; each module has one shell (`ClubRouteTabs`, `CommunicationRouteTabs`, `FacilityTabs`) because modules do not import each other's components.
- **The content keeps one element whether the strip shows or not** (a `TabPanel` reading the `Tabs` context ids), so the strip appearing after the feature check never remounts the list and its first fetch.
- **While the feature check is pending no strip is shown**, so tabs that would answer 403 never flash up.
- **Titles use the menu names** ("Zones and rates", "Log and incidents"): the platform has one `pageTitle` for the menu item and the header; the mockup's longer page titles belong to phase 3's naming work.
- **V-N01: no seam.** `AppShell` marks an item active only on its own `href` or a path below it; a sibling tab route is neither, so the fallback (title and breadcrumb name the page) applies.
- **Axe baseline:** the platform's brand link (`aria-label` "Go to dashboard") was baselined in English only; its Polish label "Przejdź do pulpitu" is the same platform node, added to the `label-content-name-mismatch` entry of `_fixtures/axe.ts`.

## Commands and results

- `yarn workspace @vereino/ui test` → 124 pass, 100 % lines/branches/functions (`route-tabs-model.ts` 100 %).
- `yarn typecheck`, `yarn typecheck:packages`, `yarn typecheck:qa` → clean (after moving the component out of `@vereino/ui`).
- `yarn lint` → first run: 6 errors `@typescript-eslint/restrict-template-expressions` (`baseId` may be undefined) in the three shells; fixed; the changed directories have 0 errors (2 earlier warnings in `IncidentsTable.tsx`).
- `yarn test:integration:vereino --filter TEST-N03`: run 1 failed at build (`Export RouteTabs doesn't exist in target module`, the build raced the restructuring); run 2: the functional part passed, axe failed on both attempts with `label-content-name-mismatch` on the platform brand link in pl only; run 3 after the baseline entry → `1 passed (4.6m)`.
- `yarn test:integration:vereino --filter TEST-N01` (five Club items) → `1 passed (2.3m)`.
- `yarn verify` → `all 15 step(s) passed` (build 110 s).

## Open problems

- None for phase 2. The rest of spec N (phases 1 remainder, 3–6) stays with its issues.

## Next steps

- Review and merge the PR; spec R can now fill the B-26 and B-27 tab contents without touching the shell.
