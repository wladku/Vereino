# Run: #292 — E12-S02 the administrator accepts cash from B-21, B-22 and B-29; B-21 and B-22 match the mockup

- **Goal and trigger:** unattended cezar run (task 9216ff95) of `om-auto-fix-issue` on #292, queued by the `cezar` label. Feature route: payments parity spec phase 2 (REQ-C03; REQ-C02 except the B-32 and dashboard mounts; TEST-C03 and TEST-C04 for B-21, B-22, B-29; AC-C03, AC-C02 in part; DD-C03).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-payments.md` (In progress; Contract 3 — the default sort of `GET /api/payments/charges` — approved by the owner on 2026-11-16 on #254, Q-C20). **Issue:** #292, epic #254. **Branch:** `feat/issue-292-accept-cash-charges-b21-b22`.

## Steps

1. Checked the issue's blocking question against the spec: `Status: In progress`, Contract 3 approved on #254 (Q-C20). No migration, no new route, no new dependency. Claimed the issue (assignee, `in-progress`, `🤖` comment).
2. Read the cash form, dialog, client and routes (`components/cash/*`, `AcceptCashDialog.tsx`, `api/cash/*`, `commands/cash.ts`, `services/cash.ts`), B-21 (`ChargesTable.tsx`), B-22 (`ChargeRecord.tsx`), B-29 (`BankStatementPage.tsx`), the URL-state precedent (`people/components/PersonsTable.tsx`, DD-U03), the mockup (`cashForm`, `screenCharges`, `screenCharge`, `screenBank`; texts `b.screenCharges.importStatement`, `b.screenCharge.colTakenBy`, `b.screenCharge.bankStatement`) and the platform list sort (`makeCrudRoute` `defaultSort`, `tiebreakSortField`).
3. Slice (a) — one form and one button:
   - `lib/cash.ts`: `CASH_ORIGINS`, `cashSelection` (all of the payer's charges ticked, or only the screen's ones, with the collector's flips); unit tests.
   - `cashRecordSchema.origin` (optional enum); `payments.cash.record` puts it in the audit context; `cashPayersQuerySchema.personId` and `payersWithDue(…, personId)` answer one payer or none.
   - `CashAcceptForm` props `origin`, `payerPersonId`, `chargeIds`, `focusOnOpen`, `formRef`; focus on the search, or on the amount once a chosen payer loads. `AcceptCashDialog` fills the screen under 640 px and submits on Ctrl/Cmd+Enter (repo precedent: the shortcut sits on `DialogContent`). New `AcceptCashButton` (closes after saving when a payer was chosen). `/club/cash` passes `origin="phone"`.
4. Slice (b) — B-21: perspectives in the mockup's order (`CHARGE_PERSPECTIVES`); `readChargeListUrl` / `chargeListUrlParams` keep perspective, period, payee, search and page in the URL with `router.replace` (no reload; `?perspective=` links still work); the client stops sending `sortField=dueDate`, so the route's default applies; "Import statement" links to B-29; `remainingShown` gives "—" for `paid`, `cancelled`, `forfeited` (also blank in the CSV). Route: `defaultSort` `periodLabel` desc, `tiebreakSortField` `dueDate`; `sortField` accepts `periodLabel`.
5. Slice (c) — B-22 and B-29: B-22 head "Accept cash" with the payer chosen, only for an open or partly paid charge with a person as payer and never a rental charge; "Received by / source" reads "bank statement" for a payment whose `source` is `bank_statement` (`paymentSourceOf`, new per-payment `source` on `GET /api/payments/charges/{id}`). B-29: "Accept cash" in the head (`origin="bank"`).
6. i18n (en, pl): `payments.charges.actions.importStatement`, `payments.ledger.payments.bankStatement`; `payments.ledger.payments.receivedBy` follows the mockup ("Received by / source", "Przyjął / źródło").
7. Tests: unit tests in `charge-ledger.test.ts` and `cash.test.ts`; new `TEST-C04-accept-cash-from-every-screen.spec.ts`; TEST-C01 asserts no "Accept cash" on a rental charge's B-22 (Q-C16).
8. Module README, spec status line, AC-C03 ticked, the API table's sort direction, spec changelog entry, this log.

## Decisions

- **Default sort direction of the due date.** The API table said `period_label` desc, `due_date` desc; Contract 3 (the approved text) and the issue say "period descending, then due date". The platform's `tiebreakSortField` is always ascending, and a second descending key would need a custom list query. Chose `period_label` desc then `due_date` asc and corrected the API table; within one month the earliest due comes first. Orders and rentals have no period (`NULL`) and come first under "All" (PostgreSQL sorts NULL first in descending order).
- **No feature check for the B-22 button.** Only the club administrator (`payments.*`) reaches B-22 (`payments.view`), and B-21 mounts the button the same way; the routes and the command still enforce `payments.cash.record`.
- **`source` added to the charge detail now** (the spec lists it under the detail route, shared with phase 6). It is derived, additive, and needed for "bank statement".
- **The B-22 dialog closes after saving**, B-21 and B-29 keep it open for the next payer (the existing B-21 behaviour of #114).

## Files changed

`payments/lib/charge-ledger.ts`, `lib/cash.ts`, their tests; `data/validators.ts`; `commands/cash.ts`; `services/cash.ts`; `api/cash/route.ts`, `api/cash/payers/route.ts`, `api/charges/route.ts`, `api/charges/[id]/route.ts`; `components/AcceptCashButton.tsx` (new), `AcceptCashDialog.tsx`, `cash/CashAcceptForm.tsx`, `cash/cash-client.ts`, `club/ClubCashPage.tsx`, `ChargesTable.tsx`, `ChargeRecord.tsx`, `bank/BankStatementPage.tsx`, `client-helpers.ts`; `i18n/en.json`, `i18n/pl.json`; `README.md`; `.ai/qa/tests/payments/TEST-C04-accept-cash-from-every-screen.spec.ts` (new), `TEST-C01-rental-charges.spec.ts`, `_fixtures/payments.ts`; the spec and its changelog entry.

## Commands and results

- `npx jest src/modules/payments/lib/__tests__/charge-ledger.test.ts src/modules/payments/lib/__tests__/cash.test.ts` — 46 passed.
- `yarn generate`, then `yarn typecheck` — 0 errors.
- `npx eslint src/modules/payments` — 0 errors (9 warnings, all in files this run did not touch).
- `yarn test:integration:vereino --filter TEST-C04` — 1 passed (2.6 min).
- `yarn test:integration:vereino --filter TEST-C01` — 1 passed (3.5 min).
- `yarn verify` — failed at `lint`: `TEST-C04…spec.ts:210:57` and `230:55` `@typescript-eslint/no-unnecessary-type-conversion` ("Passing a string to String() does not change the type or value of the string"). Fixed (the payment id is already a string), `yarn typecheck:qa` re-run, then `yarn verify --from lint` — all 13 steps passed (generate, typecheck, typecheck:packages, typecheck:qa passed in the first run).
- Lesson added: `.ai/lessons/crud-route-default-sort-and-ascending-tiebreak.md`.

## Open problems / next steps

- B-32 mount (E12-S03) and dashboard mount (E12-S07) reuse `AcceptCashButton` with `chargeIds` and `origin`.
