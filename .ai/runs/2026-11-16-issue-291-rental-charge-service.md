# Run: #291 — E12-S01 a rental creates its charge payable to the facility owner; "Rentals (municipality)" on B-21

- **Goal and trigger:** unattended cezar run (task 2429255e) of `om-auto-fix-issue` on #291, queued by the `cezar` label. Feature route: payments parity spec phase 1 (REQ-C01; TEST-C01, TEST-C02 and TEST-C03 rental parts, TEST-C16; AC-C01; DD-C01, DD-C02).
- **Spec:** `.ai/specs/implemented/2026-11-14-vereino-parity-payments.md` (Ready for implementation; migrations A1 and A2, Contract 1 and Contract 5 approved by the owner on 2026-11-16 on #254, Q-C20). **Issue:** #291, epic #254. **Branch:** `feat/issue-291-rental-charge-service`.

## Steps

1. Checked the issue's blocking question against the spec: `Status: Ready for implementation`, the eleven Ask First items approved on #254. Claimed the issue (assignee, `in-progress`, `🤖` comment); renamed the task branch.
2. Read the DD-19 seam in `facilities` (`services/charges.ts`, `commands/rentals.ts`, `commands/requests.ts`), the `payments` charge entity, list and detail routes, `my-charges`, the checkout, B-21 and B-22, the mockup texts (`b.screenCharges.tabOwner`, `b.screenCharge.toClubAccount|toOwnerAccount`).
3. Slice (a) — entity, migrations, service:
   - `payments_charges.payer_institution_id`, `payee_institution_id`, `payer_label` (encrypted, `encryption.ts`), the lookup index and the partial unique index (one live rental charge per rental).
   - `yarn db:generate` emitted one migration with the columns and both indexes; split by hand into A1 (`Migration20261116172615`, columns, transactional) and A2 (`Migration20261116172616`, `isTransactional() = false`, `lock_timeout = '5s'`, `create … concurrently if not exists`, an `indisvalid` check). A second `yarn db:generate` reports `payments: no changes`.
   - `services/charge-service.ts` (`createForSource`, `cancelForSource`, `statusOf`), registered as `payments.chargeService` in `di.ts`; error codes `charge_payer_required`, `charge_amount_invalid`; `services/directory.ts` `findInstitutions`.
   - Pure rules in `lib/charge-ledger.ts` (`rentalsPerspectiveShown`, `sourcePayerOf`, `sourceAmountValid`, `sourceChargeStatus`, `sourceCancelDecision`, `payerDisplayName`) with unit tests.
4. Slice (b) — reads and exclusions: `GET /api/payments/charges` and `/{id}` add `payerInstitution`, `payeeInstitution`, `payerLabel`; the list adds `meta.rentalsPerspective` (DD-C02, `services/ledger.ts` `rentalsPerspective`). `my-charges`, the payer's history, the Today tile, the transfer instructions (`isPayer`) leave rental charges out; `chargeVisibleTo` refuses them, so the quote and the checkout answer 403 `checkout_charge_forbidden`.
5. Slice (c) — B-21 and B-22: the hard-coded `FACILITIES_ENABLED` removed; the rentals tab follows `meta.rentalsPerspective` (a `?perspective=rentals` link falls back to the default when the club does not show it); a Payee filter; the payer column in the display order institution, person, typed-in name; the payee column names the owner institution when known. B-22: "to the club's account" / "to the account of {owner}" with "the facility owner" while no payee is set.
6. Tests: TEST-C01 (`payments/TEST-C01-rental-charges.spec.ts`) with a QA probe (`_fixtures/payments-charge-service-probe`) that calls the service directly; TEST-022 now expects a `chargeId`; `payments-rules.test.ts` lists the two new codes.
7. Module README, spec changelog entry, spec status `In progress`, this log.

## Decisions

- **`facilities` passes `payerDisplayName` for an unregistered renter** (`commands/rentals.ts`, one line; the consumer type gains the optional field). The spec says phase 1 changes nothing in `facilities`, but without the name a staff rental for an unregistered renter (B-23 allows it, E08-S02 enters one) would answer 422 `charge_payer_required` and roll back — a regression. Request approvals only take institutions and persons, so `requests.ts` is unchanged.
- **A free rental** (amount 0 — the approval's `amountOverride` allows it) gets a charge born `paid` instead of a 422: rejecting it would make a free rental impossible, and an `open` 0 zł charge would show as overdue forever. `charge_amount_invalid` is a non-integer, a negative amount, more than the facilities maximum (PLN 1 000 000) or a malformed due date.
- **The payer is normalized**: only the first present of institution, person and name is stored, so the stored row and the display order agree.
- **`cancelForSource` keeps a charge with any payment row** (reversed or not) — "a charge with any payment is left as it is" — and returns `charge_paid`; an already cancelled or forfeited charge is a no-op.
- **The service accepts a session or a job scope** (`trustedScopeOf(ctx) ?? trustedScopeOf(ctx, { job: true })`), so a future lifecycle job can cancel through it; nothing else is trusted.
- **Cash and the bank matcher leave rental charges out** (`services/cash.ts` `openPayableCharges`, `services/bank.ts` `lockOpenCharges`, the `payments.cash.record` check → 422 `cash_charges_invalid`): with the service registered, an open rental charge with a person payer would otherwise be offered to "Accept cash" and matched by a club bank transfer — club money booked on a charge payable to the owner. Not in the issue's list, but a direct consequence of registering the service (lesson `registering-a-dormant-optional-di-token`).
- **B-21 keeps a `?perspective=rentals` tab** even when the response says the club does not show it (a `setState` fallback in an effect was refused by the React lint rule); without facilities and rental charges the tab is otherwise absent. DD-C02's "absent" case is covered by the unit test of `rentalsPerspectiveShown` — every deployment enables `facilities`, so an integration test cannot reach it.
- **Out of scope here** (phase 2 and spec R): removing "Accept cash" from B-22 of a rental charge (TEST-C04), the owner as payee and the description (E11-S11), the owner report reading charges, the payment request approval path test (same service call as the staff rental).

## Commands and results

- `yarn generate` → all generators completed; `yarn typecheck` → clean.
- `yarn db:generate` → `payments: generated Migration20261116172615_payments.ts` (split by hand), then `payments: no changes`.
- `npx jest src/modules/payments/lib/__tests__/charge-ledger.test.ts --coverage` → 20 passed, `charge-ledger.ts` 100 % statements/branches/functions/lines.
- `npx jest src/modules/payments src/modules/facilities` → first run 1 failed: `payments-rules.test.ts › declares the error codes with their statuses` (`+ "charge_amount_invalid": 422`, `+ "charge_payer_required": 422`); the expected table updated. Then `npx jest src/modules/payments/lib` → 250 passed.
- `yarn test:integration:vereino --filter TEST-C01` → run 1: `SyntaxError: …_fixtures/payments.ts: Unterminated regular expression. (373:45)` / `Error: No tests found.` (a `?
` mangled while inserting the probe runner); fixed. Run 2: `1 passed (3.1m)`.
- `yarn test:integration:vereino --filter TEST-022` → `5 passed (3.7m)`.
- `yarn test:integration:vereino --filter E08-S02` (unregistered renter in the browser) → `1 passed (2.2m)`.
- `yarn verify` → run 1 `failed at lint`: `ChargesTable.tsx 282:62 error Calling setState synchronously within an effect can trigger cascading renders` and `charge-service.ts 106:12 error Forbidden non-null assertion`; both fixed. `yarn verify --from lint` → `[verify] all 13 step(s) passed`.

## Files changed

- `payments`: `data/entities.ts`, `encryption.ts`, `migrations/Migration20261116172615_payments.ts` (A1), `migrations/Migration20261116172616_payments.ts` (A2), `migrations/.snapshot-open-mercato.json`, `services/charge-service.ts` (new), `di.ts`, `lib/charge-ledger.ts`, `lib/error-codes.ts`, `lib/__tests__/charge-ledger.test.ts`, `lib/__tests__/payments-rules.test.ts`, `services/directory.ts`, `services/ledger.ts`, `services/my-charges.ts`, `services/payer-overview.ts`, `services/checkout.ts`, `services/cash.ts`, `services/bank.ts`, `commands/cash.ts`, `api/shared.ts`, `api/charges/route.ts`, `api/charges/[id]/route.ts`, `components/ChargesTable.tsx`, `components/ChargeRecord.tsx`, `components/client-helpers.ts`, `i18n/en.json`, `i18n/pl.json`, `README.md`.
- `facilities`: `services/charges.ts` (optional `payerDisplayName`), `commands/rentals.ts` (passes it for an unregistered renter), `services/owner-report.ts` (comment).
- QA: `payments/TEST-C01-rental-charges.spec.ts` (new), `_fixtures/payments-charge-service-probe/probe.mjs` (new), `_fixtures/payments.ts`, `facilities/TEST-022-rentals.spec.ts`.
- `.ai`: spec status `In progress`, changelog entry `2026-11-16-issue-291-phase-1.md`, lesson `registering-a-dormant-optional-di-token.md`, this log.

## Open problems and next steps

- Phase 2 (#292): no "Accept cash" button on B-22 of a rental charge; the rest of B-21/B-22.
- Spec R phase 11 (E11-S11, #285): `payeeInstitutionId` from `placePayee`, the `charge.rentalDesc` description, confirmation on payment through `statusOf`, the owner report from charges.
- Migrations A1 and A2 must be applied by the owner after reviewing their SQL in the PR (never `db:migrate` here).

- `yarn verify` (full, after the fixes) → `[verify] all 17 step(s) passed`.
- `yarn test:integration:vereino --filter TEST-C01` on the committed code (after the lint fixes) → `1 passed (3.0m)`.
