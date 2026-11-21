# Run: #484 — dashboard tile titles in both locales, and a check for a missing one (E20-S05)

- **Trigger**: Cezar run c30c5c84 (label `cezar` on #484), skill `om-auto-fix-issue` with the repo-local override.
- **Issue**: #484 (epic #479). **Branch**: `fix/issue-484-dashboard-tile-titles-i18n`. **Route**: `direct` (bug fix), `backend-ui` + `debugging`.

## Goal

On B-01 (`/backend`) every tile title and description is in the page's locale; `yarn verify` fails, naming the
widget file, when a widget has no catalog key; one heading above the tiles (the greeting).

## Root cause

The platform `DashboardScreen` translates a widget's title/description only through catalog keys derived from its id
(`<prefix>.widgets.<last>.title`, `<id>.title`, `dashboard.widgets.<id>.title`) and falls back to the English
`metadata.title`. `activities`, `people.sectionsWithoutCoordinator` and `facilities.todayAtFacility` had keys; the seven
widgets named in the issue had none. `i18n:check-hardcoded` does not look at object properties, so nothing caught it.
The page rendered `BackendGreeting` (a `<p>`) above `DashboardScreen`, whose own `<h1>` "Dashboard"/"Pulpit" and
subtitle made a second heading.

## Steps and decisions

1. Claimed #484 (assignee, `in-progress`, `🤖` claim comment naming this run).
2. Added `<module>.dashboard.widgets.<name>.title|description` to `en.json` and `pl.json` of `people` (2 widgets),
   `payments` (4) and `facilities` (1). Polish names follow the existing menu/page terms ("Zbiórki zamówień",
   "Zgłoszenia do akceptacji", "Bez płatnika" → "Należności bez płatnika", "Wyciągi bankowe"). The English literals stay in
   `metadata` as the platform's required fallback.
3. New `packages/app/scripts/vereino-widget-titles.mjs` (100 % covered by `scripts/__tests__/vereino-widget-titles.test.mjs`),
   called by `i18n:check-hardcoded --strict` (already a `yarn verify` step) — no new verify step. It reads every
   `widgets/dashboard/*/widget.ts(x)` of the Vereino modules, takes the literal `id`, and requires the title (and the
   description, when declared) under any key form the platform resolves in every catalog of the module. Decision: check
   only the widget's own module catalogs, the repository convention, rather than the merged catalog.
4. One heading: the greeting is now the `<h1>`; the page wraps `DashboardScreen` in
   `<div data-testid="backend-dashboard" className="vereino-dashboard">`, and `globals.css` hides the platform title
   block (`.vereino-dashboard > .space-y-6 > :first-child > :first-child`) and right-aligns the Customize button. The
   platform has no prop for this; the selector depends on the platform header markup (commented like the
   `.vereino-login-body` precedent) and TEST-N04 guards it (exactly one level-1 heading). A first attempt with Tailwind
   arbitrary variants (`[&>div...]:hidden`) failed `ds:check` (`arbitrary-tailwind` also covers variants).
5. TEST-N04 UI: asserts one `h1` (the greeting) and every title and description of the administrator's 11 tiles in
   Polish and English at 1280 and 375 px; screenshots `b01-admin-{pl,en}-{1280,375}-{light,dark}.png`.
   Each scheme reloads the page before the shot (as `scanInColorSchemes` does): a first version switched the scheme
   without a reload and caught light chrome around dark cards.
6. Lesson `dashboard-widget-title-from-catalog-key`.

## Files changed

- `packages/app/src/modules/{people,payments,facilities}/i18n/{en,pl}.json`
- `packages/app/scripts/vereino-widget-titles.mjs`, `packages/app/scripts/__tests__/vereino-widget-titles.test.mjs`,
  `packages/app/scripts/i18n-check-hardcoded.mjs`
- `packages/app/src/app/(backend)/backend/page.tsx`, `packages/app/src/app/globals.css`,
  `packages/app/src/components/BackendGreeting.tsx`
- `packages/app/.ai/qa/tests/club_core/TEST-N04-dashboard-menu-counts.spec.ts`
- `.ai/lessons/dashboard-widget-title-from-catalog-key.md`, this log

## Commands and results

- `yarn test:scripts` — pass; `vereino-widget-titles.mjs` 100/100/100, all files 100 %.
- Negative case: deleting `payments.dashboard.widgets.overdue.title` from `payments/i18n/pl.json` →
  `yarn i18n:check-hardcoded --strict` exit 1 with
  `src/modules/payments/widgets/dashboard/overdue/widget.ts [widget-title] widget "payments.dashboard.overdue" has no title in i18n/pl.json (add "payments.dashboard.widgets.overdue.title")`;
  restored → exit 0.
- `yarn test:integration:vereino --filter TEST-N04` — 2 passed, four times: after the first edit, after the CSS move,
  after adding the screenshots and after the reload fix.
- `yarn verify` — first run failed at `lint`:
  `TEST-N04-dashboard-menu-counts.spec.ts 71:47 error Invalid type "string | undefined" of template literal expression @typescript-eslint/restrict-template-expressions`
  (fixed with `parts.pop() ?? widgetId`); then `format:check` (fixed by `yarn format`); then `ds:check`:
  `src/app/(backend)/backend/page.tsx:39:20 [arbitrary-tailwind] Use the design-system scale instead of arbitrary Tailwind values.`
  (moved to `globals.css`). Full run afterwards: all 18 steps passed; after the later TEST-N04 edits
  `yarn verify --from typecheck:qa` passed (15 steps) twice.

## Open problems / next steps

- The hidden title block depends on the platform `DashboardScreen` markup; an upgrade that changes it shows the
  "Dashboard" heading again and TEST-N04 fails on the second `h1`.
