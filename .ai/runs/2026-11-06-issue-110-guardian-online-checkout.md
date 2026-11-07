# Run — issue #110 (E07-S03): a guardian pays selected charges online and sees the result after returning from Stripe

- **Trigger:** cezar task "110" (`om-auto-fix-issue`, unattended). The first pass stopped before claiming. It resumed on the owner's instruction (2026-11-06): "continue autonomously, make reasonable assumptions, do not ask".
- **Issue:** #110, epic #106. Depends on #107 (closed; V-5 resolved in #148, modules approved in D-030) and #109 (merged as #202).
- **Spec:** `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 4 step 4 and part of step 5 (DD-42; REQ-012, REQ-002, R10, R13; TEST-019, TEST-021, TEST-055 checkout part, TEST-057). UX concept M-08, M-09, flow F-07.
- **Branch:** `feat/issue-110-guardian-online-checkout`.

## Steps

1. First pass: read the issue, #107 and D-030, the spec (DD-42, data model, API, events, phase 4) and the #109 run log. The story needs a new `payments` migration, which no recorded approval covered (D-030 covers only the platform modules' own migrations). The run stopped before claiming and posted the need with proposed defaults on #110 (comment 6694940071). Its log was committed as 3e4914d.
2. Resume: the owner told the run to continue autonomously. The run recorded the migration and three defaults on #110 (comment 6694954218) and claimed the issue (assignee, `in-progress`, claim comment 6694955349).
3. Read the installed 0.9.0 contract:
   - `paymentGatewayService` (`createPaymentSession`, `getPaymentStatus`, `refundPayment`, `cancelPayment`);
   - the status machine, where `failed`, `cancelled` and `expired` are terminal;
   - the webhook route and processor, with `mapStatus(providerStatus, eventType)`;
   - the adapter, webhook and embedded-renderer registries;
   - the Stripe adapter (amounts in złoty, the embedded `stripe.payment_element` session);
   - the generated `payments.client.generated` group in `ClientBootstrap`.
4. Pure rules in `lib/checkout-rules.ts`, with 28 unit tests at 100 % coverage:
   - the R13 fee (exact basis points);
   - the checkout refusals;
   - the grosz ↔ złoty conversion;
   - the provider outcome;
   - the fulfilment plan (oldest first; a share whose charge is no longer payable becomes an overpayment, Q-049);
   - the M-09 state and polling window;
   - the refund refusal;
   - the 24-hour expiry.
5. Entities and migration `Migration20261106204626_payments`:
   - `payments_checkouts`;
   - `gateway_transaction_id`, `gateway_refund_id` and `is_overpayment` on `payments_payments`;
   - the hand-written narrowing of `payments_payments_reverses_unique`, so an online payment can be refunded in parts.

   Generated offline with an unreachable `DATABASE_URL`, and never applied to a dev database. `payment_gateways` and `gateway_stripe` were enabled in `modules.ts` (D-030).
6. Overpayments never count as paid. `paidTotals`, the command ledger (`ledgerOf`) and the charge detail all leave them out, and the detail gains `overpayment` and `gatewayRefundId`.
7. Services:
   - `services/checkout.ts`: the payer behind `people.paymentsGate`, the visible charges, the quote, the fulfilment `fulfilCheckout` (row locks plus the unique gateway index), `markCheckoutFailed` and `reconcileCheckouts`;
   - `services/my-charges.ts`;
   - the gateway test adapter `services/test-gateway.ts` (`vereino_test`, registered by `payments/di.ts` only under `OM_INTEGRATION_TEST=true`).
8. Commands `payments.checkout.create` and `payments.payments.refund` (`commands/checkout.ts`). The refund's reversing-entry id derives from the payment and the operation id, so a retry returns the same refund.
9. Routes:
   - `GET /api/payments/my-charges`;
   - `POST /api/payments/checkout/quote`;
   - `POST /api/payments/checkout`;
   - `POST /api/payments/checkouts/{id}/refresh`;
   - `POST /api/payments/payments/{id}/refund`.

   Also: the subscribers `payments:gateway-captured` and `payments:gateway-failed`, the CLI `payments reconcile-checkouts`, ACL features `payments.view_own` and `payments.pay_online`, error codes, and three new events.
10. UI:
    - M-08 `/club/payments` (selection, quote with the fee line, the embedded gateway form; a charge without a payer disabled with "No payer — contact the club");
    - M-09 `/club/payments/return` (received; in progress, refreshing every 3 s for 30 s, then "Refresh status"; interrupted);
    - `PaymentsClubFrame` with the Payments tab and the "Payments" tile on `/club`;
    - the member bootstrap profile now loads the `payments` client group;
    - the test renderer `widgets/payments/client.tsx`;
    - en and pl catalogs.
11. Integration tests:
    - `TEST-019-online-checkout`, which includes the TEST-055 checkout part;
    - `TEST-021-checkout-security`;
    - `TEST-057-late-capture-and-refunds`;
    - `E07-S03-online-payment-pages` (browser, 375 px, axe in both schemes).
12. Spec:
    - step 4 marked implemented and step 5 partly;
    - the Payment indexes, `my-charges`, the events, the compliance row "User approval" and the verdict updated;
    - changelog entry `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-06-issue-110-online-checkout.md`.
13. Lesson `db-generate-ignores-expression-index-changes`.

## Decisions

- **The migration (Ask First):** taken as approved under the owner's instruction and recorded on #110. It is additive (S14.6), with `lock_timeout` and a full `down()`.
- **Test adapter instead of Stripe in tests:** the spec's convention (`integrations.mock-adapters`). The `example` module's `mock` adapter is not enabled, so `payments` has its own, registered only under `OM_INTEGRATION_TEST`. Its state lives in the server process. Tests therefore drive the sweep's logic through the refresh route, never the CLI, which runs in another process.
- **`payment.silent` webhooks:** they change only the provider state (`mapStatus` → `unknown`). This reproduces the delayed-webhook and late-capture cases without a gateway event.
- **Refund idempotency:** the reversing entry's id is a hash of the payment and the operation id. The run detects a retry before calling the gateway; the gateway also collapses the call by its operation id.
- **Partial refunds:** the "one reversal per payment" index now excludes rows with a `gateway_refund_id`, and each refund is unique by its provider refund id.
- **Overpayment rows:** stored as payments with `is_overpayment = true`. They are excluded from what was paid on a charge, and refunding one keeps the charge's status.
- **Sweep as a CLI** (default on #110): `mercato payments reconcile-checkouts --tenant --org`. The 15-minute schedule comes later.
- **Card only:** `paymentTypes: ['card']` until the Stripe sandbox run confirms BLIK and P24 (Q-016).
- **TEST-057 (b)** (24-hour expiry end to end) is covered by the `isExpirable` unit test. A real wait is not practical in the suite.

## Files changed

- `packages/app/src/modules.ts`, `packages/app/src/components/ClientBootstrap.tsx`.
- `packages/app/src/modules/payments/`:
  - `acl.ts`, `cli.ts`, `di.ts`, `events.ts`;
  - `data/entities.ts`, `data/validators.ts`;
  - `lib/checkout-rules.ts` (+ test), `lib/error-codes.ts`, `lib/__tests__/payments-rules.test.ts`;
  - `commands/checkout.ts`, `commands/ledger.ts`;
  - `services/checkout.ts`, `services/my-charges.ts`, `services/test-gateway.ts`, `services/ledger.ts`;
  - `subscribers/gateway-captured.ts`, `subscribers/gateway-failed.ts`;
  - `api/my-charges`, `api/checkout`, `api/checkout/quote`, `api/checkouts/[id]/refresh`, `api/payments/[id]/refund`, `api/charges/[id]/route.ts`, `api/shared.ts`;
  - `components/club/*`, `frontend/club/payments/**`, `widgets/payments/client.tsx`;
  - `i18n/en.json`, `i18n/pl.json`;
  - `migrations/Migration20261106204626_payments.ts`, `migrations/.snapshot-open-mercato.json`.
- `packages/app/src/modules/people/components/club/ClubTodayPage.tsx`, `people/i18n/en.json`, `people/i18n/pl.json`.
- `packages/app/.ai/qa/tests/_fixtures/payments.ts`, `payments/TEST-019-online-checkout.spec.ts`, `payments/TEST-021-checkout-security.spec.ts`, `payments/TEST-057-late-capture-and-refunds.spec.ts`, `payments/E07-S03-online-payment-pages.spec.ts`.
- `.ai/specs/2026-10-27-vereino-club-payments.md`, its changelog entry, `.ai/lessons/db-generate-ignores-expression-index-changes.md`, `.ai/lessons.md`, this log.

## Commands and results

- `DATABASE_URL=postgres://u:p@127.0.0.1:1/none yarn db:generate`: `payments: generated Migration20261106204626_payments.ts`; other modules no changes. After narrowing the expression index it printed "payments: no changes" (the lesson), so the index change was written by hand. No `db:migrate` ran against any dev database.
- `npx jest src/modules/payments/lib/__tests__/checkout-rules.test.ts --coverage`: 28 passed, 100 % statements, branches, functions and lines.
- `yarn typecheck`:
  - first UI run failed with `Type '"info"' is not assignable to type 'AlertStatus'` and `role` not accepted on `Alert`; fixed by using `information` and dropping `role`;
  - then exit 0. `yarn typecheck:qa`: exit 0.
- `yarn lint`, first run: 17 errors in the new files, all fixed:
  - a restricted `@mikro-orm` import in a route (moved to `quoteCheckout` in the service);
  - `Date.now` during render on M-09 (replaced by a timer-driven window);
  - a component created during render (now `React.createElement` on the registry entry);
  - void arrow shorthands;
  - an unbound method;
  - `async` without `await` in the test adapter;
  - unused imports.
- `yarn i18n:check-hardcoded --strict`: first run flagged `"Invalid test gateway signature"`; developer errors now carry `[internal]`; then exit 0.
- `yarn ds:check`, `yarn contracts:check`, `yarn lessons:check`, `yarn spec-changelogs:check`, `yarn format:check`: all exit 0.
- `yarn test`: 56 suites, 643 tests passed, coverage thresholds met.
- `yarn test:integration:vereino --filter TEST-019`: 1 passed (2.2 m) on the first run; rerun after the lint fixes is recorded below.
- `--filter TEST-021`: 1 passed (1.6 m).
- `--filter TEST-057`: 1 passed (1.6 m).
- `--filter E07-S03`: 1 passed (1.4 m), with no blocking axe violation and no overflow at 375 px in either scheme.

## Open problems / next steps

- The owner confirms or overrides the defaults recorded on #110:
  - the migration;
  - the test adapter;
  - API-only refunds;
  - the sweep as a CLI.
- Still outside this PR:
  - the Stripe sandbox run of card, BLIK and P24 with the club's test keys (step 1);
  - the scheduled `payments:reconcile-checkouts`;
  - the payer code and the payments widgets (step 5);
  - a refund screen.
