# Run: issue #297 — E12-S07 an administrator sees bank statements and cash, order campaigns and charges without a payer on the dashboard

- **Goal and trigger:** cezar task (`om-auto-fix-issue 297`, label `cezar`): build phase 7 of `.ai/specs/2026-11-14-vereino-parity-payments.md` (REQ-C09; REQ-C02 dashboard mount; TEST-C10, TEST-C04 dashboard; AC-C09, AC-C02 in part).
- **Spec / issue / branch:** spec `In progress`, Ready for implementation since the owner's approval of 2026-11-16 on #254 (Contract 5 names the `only=counts` parameter, approved); issue #297; branch `feat/issue-297-admin-dashboard-bank-cash-charges`; worktree `.ai/cezar/worktrees/8ffd0f22-…`. Dependencies #292 (E12-S02) and #296 (E12-S06) closed and merged.

## Steps

1. Checked the claim state (no assignee, no `in-progress`, no claim comment, no PR), then claimed #297 (assignee, `in-progress`, 🤖 comment naming the worktree, branch and start). Feature route: spec found and approved.
2. Read the spec (REQ-C09, the B-01 row of *UI and Interaction Contracts*, the API row of `GET /api/payments/dashboard`, TEST-C10, phase 7), the mockup `screenDashboard` and `kitDashboardWidget` with their en/pl texts, the existing widgets (`widgets/dashboard/overdue`, `without-payer`, `components/PaymentsDashboardWidget.tsx`), the refund count of #296 (`chargesToRefund`), the bank statuses (`lib/bank-matching.ts`), the campaign KPIs (`services/order-campaigns.ts` `campaignsKpis`) and the optional-feature checks of `facilities/api/today`.
3. Slice (a) the read: `lib/dashboard.ts` (statuses to decide, running campaign statuses, list limit, `only` values, `moreCount`), `lib/payer-summary.ts` `overdueSummary` gains `withoutPayer`; `services/dashboard.ts` holds `paymentsDashboard` (moved from `services/payer-overview.ts`) and `paymentsDashboardCounts`; `api/dashboard/route.ts` checks `payments.bank.import` and `payments.orders.manage` through `rbacService` and answers `?only=counts`, 400 `query_invalid` for another `only`.
4. Slice (b) the widgets: `PaymentsDashboardWidget` renders four kinds from the one shared query; new `widgets/dashboard/bank/` and `widgets/dashboard/order-campaigns/`; "Overdue" adds charges, families and without-payer counts (plural forms from the mockup); "Charges without a payer" lists up to five rows linking to B-22 and "and {n} more"; i18n en/pl.
5. Tests: unit `lib/__tests__/dashboard.test.ts`, `payer-summary.test.ts` updated; integration `payments/TEST-C10-dashboard-widgets.spec.ts` (TEST-C10 and the dashboard part of TEST-C04); `E07-S04` asserts the extended read with `toMatchObject`; fixture `paymentsDashboardCounts`.
6. Docs: module README (B-01 since #297, the cash dialog's mounts), spec status line, spec changelog file `2026-11-19-issue-297-phase-7.md`.

## Decisions

- **`withoutPayer.items[]` carries the charge `id`** besides description, period and person, so each row links to B-22 where "Assign payer" is (J-C05 step 1). Additive.
- **The "Bank statements and cash" widget needs `payments.bank.import` and `payments.cash.record`**: it carries both actions, and the client cannot tell which features a user holds; today only the club administrator holds either (`payments.*`).
- **Loading only before the first answer**: the shared query refetches after "Accept cash"; showing the loading state on every refetch would unmount the open dialog.
- **Campaigns ordered by closing date**; the order is not named by the spec.
- **"Open list"** (the existing text) is kept as each widget's open link instead of the mockup's "Open", so all four widgets read the same.

## Commands and results

- `yarn generate`: pass. `yarn typecheck`: first run failed (`describe`/`it` without `@jest/globals` in the new test; `Loaded<OrderCampaign>` not assignable to `OrderCampaign[]`), fixed; second run pass.
- `npx jest src/modules/payments/lib/__tests__/dashboard.test.ts src/modules/payments/lib/__tests__/payer-summary.test.ts`: 17 passed.
- `yarn typecheck:qa`, `format:check`, `ds:check`, `i18n:check-hardcoded --strict`, `qa-texts:check`, `spec-changelogs:check`, `contracts:check`: pass.
- `yarn lint`: 2 errors in TEST-C10 (`restrict-template-expressions`, a number in the timing log line); fixed.
- `yarn test:integration:vereino --filter TEST-C10`: failed before the first step — `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file` (the host has no Chromium system libraries; lesson `cezar-host-integration-runs-without-browser`). The browser steps are proven in CI only.
- Following the lesson, the API half ran locally from a temporary copy without the `page` fixture (`TMPC10-api.spec.ts`, deleted before the commit): `yarn test:integration:vereino --filter TMPC10` — 1 passed (33.3 s). Covered: the full read (overdue counts, without-payer rows, `toRefund`, `bank.toDecide`, both running campaigns, the draft left out), `?only=counts` equal to the full read, another club's transfer not counted, 400 for an unknown `only`, and a club administrator without the two features getting neither block. Timing on the Testcontainers host: `GET /api/payments/dashboard` 26 ms, `?only=counts` 13 ms (S7.6 list p95 ≤ 500 ms).
- Only in CI (browser): the B-01 widget texts and links, "Accept cash" from the dashboard with `origin = dashboard` and the refreshed "Overdue", the "Open list" landings, "All imported transfers are settled", the two widgets hidden without the features, and the extended E07-S04 assertion.
- `yarn verify`: all 18 steps passed.

## Open problems and next steps

- The browser half of TEST-C10 and E07-S04 is proven in CI only (this host cannot launch Chromium).
- Spec N's sidebar counts (#260, E09-S06) can now read `GET /api/payments/dashboard?only=counts`.
- Phase 12 of the spec remains; the spec stays `In progress`.
