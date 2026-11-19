# Run: issue #260 — greeting, role dashboards, menu counts and the member-interface link (E09-S06)

- **Goal and trigger:** Cezar run (task 35552f08) started by the `cezar` label on #260; `om-auto-fix-issue` with the vereino override.
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` phase 6 (REQ-N03, REQ-N04, TEST-N04, AC-N03, AC-N04, DD-N05) · #260 (epic #251) · `feat/issue-260-staff-dashboard-widgets`.
- **Readiness:** the spec is `Ready for implementation`; the owner approved Q-N03 (`dashboards.view` for the coordinator and the attendant) on 2026-11-15 ([#251](https://github.com/wladku/Vereino/issues/251#issuecomment-6891956957)); #246 and #297 (spec C's REQ-C09, the `?only=counts` read) are closed, so all four counts ship. No migration, module or dependency.

## Steps

1. Claimed #260 (assignee, `in-progress`, `🤖` claim comment naming the worktree, branch and start time).
2. Slice (b) grants: `packages/core/src/roles.ts` — `dashboards.view` for `coordinator` and `facility_operator`; `roles.test.mjs` inverted (and asserts a coach and a member still lack it); `activities/README.md` widget note rewritten. Synced to tenants by the existing `defaultRoleFeatures` / `auth sync-role-acls` path.
3. Slice (c) counts: `navBadgeEffect` in `@vereino/ui` (`src/admin/nav-badge-counts.ts`, 100 % unit-tested): reads at once and 60 s after each answer, publishes "{n} waiting" labels, nothing at zero, on a malformed value or a failed read; the cleanup drops a stale answer, so the re-run on every navigation (the injection context's `path`) never races. Three headless widgets on `backend:nav:badges`: `activities.injection.nav-badge-sessions`, `payments.injection.nav-badges`, `facilities.injection.nav-badge-requests`, each with its `injection-table.ts` row and a `*.nav.badge.waiting` key in `en`/`pl`.
4. Slice (a) link and greeting: `components/use-staff-person.ts` (one `GET /api/people/me` per session, React Query, `staleTime: Infinity`), `BackendHeaderChrome.tsx` ("Interfejs członkowski" inline on md+, in the "More" menu below 768 px, only when a person resolves), `components/BackendGreeting.tsx` above `DashboardScreen` in `app/(backend)/backend/page.tsx`; app catalog keys `vereino.backend.memberInterface`, `vereino.dashboard.greeting|greetingNoName|subtitle` in all five locales (`de`, `es`, `ko` with the English value, as the spec states), and `dashboard.empty.readonly` overridden in `en`/`pl` to "Nothing needs action today.".
5. TEST-N04 (`.ai/qa/tests/club_core/TEST-N04-dashboard-menu-counts.spec.ts`).

## Decisions

- **One payments widget instead of two.** `GET /api/payments/dashboard?only=counts` was built for exactly these two counts and answers each under its own feature; one read per refresh instead of two. The spec's deliverable line was updated.
- **Sessions count window.** A-N14 defines the count as the B-15 tab "Needing a coach"; that tab and the dashboard widget use "from today for 14 days", so the count uses the same window (`sessionsNavBadgeQuery`) and equals the list it describes. The spec's business rule was clarified.
- **Link condition.** The spec's *Top bar and dashboard* paragraph (which supersedes the issue's `people.self` wording) conditions the link on `GET /api/people/me` resolving a person.
- **Platform heading kept.** `DashboardScreen` renders its own heading and "Customize" button with no seam to replace it; hiding it by DOM structure would break silently on an upgrade, so the greeting sits above it.

## Files changed

`packages/core/src/roles.ts`, `packages/core/src/__tests__/roles.test.mjs`, `packages/ui/src/admin/nav-badge-counts.ts`, `packages/ui/src/__tests__/nav-badge-counts.test.mjs`, `packages/ui/src/index.ts`, `packages/app/src/components/{BackendHeaderChrome.tsx,BackendGreeting.tsx,use-staff-person.ts}`, `packages/app/src/app/(backend)/backend/page.tsx`, `packages/app/src/i18n/{de,en,es,ko,pl}.json`, `packages/app/src/modules/activities/{README.md,lib/dashboard-rules.ts,lib/__tests__/dashboard-rules.test.ts,widgets/injection-table.ts,widgets/injection/nav-badge-sessions/*,i18n/*}`, `packages/app/src/modules/payments/{widgets/injection-table.ts,widgets/injection/nav-badges/*,i18n/*}`, `packages/app/src/modules/facilities/{widgets/injection-table.ts,widgets/injection/nav-badge-requests/*,i18n/*}`, the spec and its changelog entry, TEST-N04, this log.

## Commands and results

- `yarn workspace @vereino/core test` — pass 112, fail 0, 100 % coverage.
- `yarn workspace @vereino/ui test` — pass 210, fail 0, `nav-badge-counts.ts` 100/100/100.
- `yarn generate` — completed; `yarn typecheck` — exit 0.
- `yarn test:integration:vereino --filter TEST-N04`, first run (one test with the browser): failed before any step — `browserType.launch: … chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file` (the host lacks Chromium's system libraries; lesson `cezar-host-integration-runs-without-browser`). The test was split into an API test and a browser test, each with its own fixture (`seed`).
- Second run (`--no-build`): `TEST-N04 API` **passed** (7.5 s): the exact layout widgets of the administrator (nine), both coordinators (two sessions widgets) and the attendant (none); the count reads 1 / 1 / 0 for the administrator and the two coordinators, `{ bank: { toDecide: 2 }, campaignsRunning: 1 }`, requests `total` 1, 403 on the payments and requests reads for the coordinator and the attendant, `GET /api/people/me` 200 for the administrator and 404 `person_not_linked` for the unlinked account. `TEST-N04 UI` failed again only on the missing `libatk`: the browser steps (sidebar counts 1, 2, 1, 1; greeting and date; the link inline and in the "More" menu at 375 px; the attendant's "Nothing needs action today"; axe at 1280 px in `pl` and `en`, light and dark) run only in CI.

## Open problems / next steps

- AC-N03 and AC-N04 stay unticked in the spec until CI's browser run of `TEST-N04 UI` is green on the PR.
