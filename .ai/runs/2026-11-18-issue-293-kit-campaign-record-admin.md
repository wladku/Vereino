# Run — E12-S03 kit campaign record (B-32) and builder notices (B-31), issue #293

- **Trigger:** Cezar queued `om-auto-fix-issue 293` (label `cezar`, 2026-11-18T20:01Z); unattended run.
- **Issue:** [#293](https://github.com/wladku/Vereino/issues/293) — E12-S03, epic #254, depends on #292 (closed).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-payments.md`, phase 3 (REQ-C05; REQ-C02 for the B-32 mount; TEST-C06, TEST-C04 for B-32; DD-C04). Ready for implementation since the owner's approval on #254 (2026-11-16).
- **Branch:** `feat/issue-293-kit-campaign-record-admin` (Cezar worktree).

## Steps

1. Claim: assignee, `in-progress`, `🤖` claim comment naming the worktree and branch. Classified as a feature; the spec covers it, so it is built directly from phase 3 (no new spec).
2. Slice (a) reads (commit ff1f688c): `lib/order-campaigns.ts` (`notHandedOver`, summary `inSets` and print `participant`, `orderPaymentEntries`) with unit tests; `services/order-campaigns.ts` (row fields, guardians of missing children through `activeGuardians` + the foundation contact resolver, print child); additive response schemas of `GET /api/payments/orders`, `…/order-campaigns/{id}`, `…/summary`, `…/missing`.
3. Slices (b)+(c) UI (commit 559bc80a): `OrderCampaignPage.tsx` (Orders tab columns and row actions, three tiles with hints, tab counts, summary warning/in-sets/child, No order guardians, Close and Complete dialogs), `OrderCampaignForm.tsx` (B-31 collecting alert, locked warning with the way back), `AcceptCashButton.tsx` (size, label, aria-label, test id), `orders-client.ts` (row types, `pluralKey`), 55 catalog keys in en and pl (`payments.orders.kpi.value` removed, no longer used).
4. Tests: `TEST-C06-kit-campaign-record.spec.ts` (TEST-C06, TEST-C04 for B-32); E07-S08's exact KPI assertion gains `notHandedOver`.
5. Independent review (a subagent, read-only) of the diff: no correctness or security defect. Fixed: Polish plural forms of "kits not marked as handed over"; the row buttons' accessible names now contain their visible label ("Gotówka za strój: …", WCAG 2.5.3); the unpaid hand-over warning omits the due-date sentence when the charge has no date. Not changed: "Hand over" needs `payments.groups.collect`, which every role that opens B-32 (`payments.orders.manage`) holds today; a custom role with only the latter would get a 403.
6. CI round 1 (run 44392929919): shards 1 and 2 passed; shard 3 failed on two tests. E07-S08 still expected the old tile text `/1 (of|z) 3/` (received "1 / 3"); fixed. TEST-C06's axe scan reported one critical `aria-allowed-attr` node on B-32 in en light and dark: the platform `StepIndicator` renders `<ol aria-orientation=…>`, and `aria-orientation` is not allowed on a list. Added a `PLATFORM_BASELINE` entry matched by `data-slot="step-indicator"`, so the rule still fails on Vereino markup. The steps after the scan ran first in that CI round.
7. Spec: status line names phase 3 (#293), AC-C05 ticked, changelog file `2026-11-18-issue-293-phase-3.md`. Lesson `cezar-host-integration-runs-without-browser`.

## Decisions

- The supplier CSV is unchanged (Q-C11): `supplierSummaryCsv` ignores `participant` and `inSets`; its unit test still asserts the exact bytes.
- A payment row names the collector of the cash, else the person who recorded it; reversed and reversing entries and online overpayments are not listed (they are not money the order holds).
- "No order" reads guardian e-mails through `contactResolver().contacts` (decrypted in memory) and returns only `hasEmail`, never the address.
- Hand over is offered only in `delivered` (the spec and the issue), although the command also accepts `completed`; the row also needs the child's current group, which the command requires.
- Three tiles as the wireframe (the value moved into the Paid hint); `kpi.ordersOf` reads "{orders} / {children}".
- Plural texts ("N kits not marked as handed over", "Collection in progress (N orders)") use `.one/.few/.many/.other` keys picked by `Intl.PluralRules`, the pattern of `facilities/club-places`.
- "Ordered by" and "Print" are dropped from the column list under 768 px (`useIsMobile`), because `DataTable` renders every column at every width.
- `campaignMissing` reads guardians only when asked (`withGuardians`), so the reminder command and the "Close orders" count keep their previous queries.

## Files changed

- `packages/app/src/modules/payments/lib/order-campaigns.ts`, `lib/__tests__/order-campaigns.test.ts`
- `packages/app/src/modules/payments/services/order-campaigns.ts`
- `packages/app/src/modules/payments/api/shared.ts`, `api/orders/route.ts`, `api/order-campaigns/[id]/summary/route.ts`, `api/order-campaigns/[id]/missing/route.ts`
- `packages/app/src/modules/payments/components/AcceptCashButton.tsx`, `components/orders/OrderCampaignPage.tsx`, `components/orders/OrderCampaignForm.tsx`, `components/orders/orders-client.ts`
- `packages/app/src/modules/payments/i18n/en.json`, `i18n/pl.json`
- `packages/app/.ai/qa/tests/payments/TEST-C06-kit-campaign-record.spec.ts`, `E07-S08-order-campaign-admin.spec.ts`
- `.ai/specs/2026-11-14-vereino-parity-payments.md`, `.ai/specs/changelog/2026-11-14-vereino-parity-payments/2026-11-18-issue-293-phase-3.md`, `.ai/lessons/cezar-host-integration-runs-without-browser.md`, this log

## Commands and results

- `yarn test`: 100 suites, 1432 tests passed; `lib/order-campaigns.ts` 100 % lines, branches, functions.
- `yarn typecheck`, `yarn typecheck:qa`, `yarn lint` (no warning in the changed files), `yarn qa-texts:check`, `yarn spec-changelogs:check`: pass.
- `yarn test:integration:vereino --filter TEST-C06`: first `Could not find a working container runtime strategy` (the session lacks the `docker` group); under `sg docker` the browser failed to launch: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file` (the host has no Chromium libraries; not installed — system change).
- A temporary API-only copy of TEST-C06 (deleted, not committed) under `sg docker`: first failed on the test's own bug (the place response carries `orderId`, not `id`; fixed in TEST-C06 too), then **1 passed**: the row reads, overdue, supplier, KPIs, `inSets`, print child, CSV without names or phone, guardians with `hasEmail`, 409 `order_not_delivered`, and after delivery the administrator's hand-over: 409 `order_unpaid_confirm_required`, then 200 with `handedOverBy` = the administrator (DD-C04).
- `yarn verify`: generate … lint passed, `format:check` failed on the new test file; after `yarn format`, `yarn verify --from format:check` passed every step. After the review fixes, `yarn verify --from typecheck` passed every step.

## Open problems

- The browser steps of TEST-C06 (B-32 columns, Cash from the row, Hand over dialog, Complete dialog, B-31 alerts, axe in both locales and schemes, 375 px) and E07-S08 did not run on this host; CI runs them.
- AC-C02 stays open until the dashboard mount (phase 7).

## Next steps

- CI's integration shards confirm TEST-C06 and E07-S08; review the PR.
